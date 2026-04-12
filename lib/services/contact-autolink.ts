import "server-only";
import { db } from "@/db/drizzle";
import {
  documents,
  documentProcessingResults,
  contacts,
  caseContacts,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Auto-populate contacts from AI extraction results (SA-6).
 *
 * When a document finishes processing, the extraction results land in
 * `document_processing_results.ai_classification.extractions`. This
 * helper pulls out any extractions classed as:
 *   - provider (medical provider)
 *   - judge / alj (SSA judge / ALJ)
 *   - representative (claim representative or counsel)
 *
 * For each unique name we upsert into `contacts` with the right
 * `contactType` and link into `case_contacts` if not already linked.
 *
 * Intended to be called from the document-processor right after the
 * chronology row is created. Best-effort: failures are logged and never
 * thrown so the main processing flow keeps going.
 */

type ExtractionRow = {
  extraction_class: string;
  extraction_text: string;
  attributes?: Record<string, unknown>;
};

const PROVIDER_CLASSES = new Set(["provider", "medical_provider"]);
const JUDGE_CLASSES = new Set(["judge", "alj", "administrative_law_judge"]);
const REPRESENTATIVE_CLASSES = new Set([
  "representative",
  "claim_representative",
  "attorney",
]);

function normalizeName(name: string): {
  firstName: string;
  lastName: string;
} | null {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  // Strip common prefixes (Dr., Mr., Ms., Hon.)
  const stripped = cleaned.replace(
    /^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Hon\.?|Judge)\s+/i,
    "",
  );
  const parts = stripped.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

type ContactTypeResolution = {
  contactType: "provider" | "ssa_judge" | "representative";
  relationship: string;
};

function resolveType(extractionClass: string): ContactTypeResolution | null {
  const c = extractionClass.toLowerCase();
  if (PROVIDER_CLASSES.has(c)) {
    return { contactType: "provider", relationship: "provider" };
  }
  if (JUDGE_CLASSES.has(c)) {
    return { contactType: "ssa_judge", relationship: "judge" };
  }
  if (REPRESENTATIVE_CLASSES.has(c)) {
    return { contactType: "representative", relationship: "representative" };
  }
  return null;
}

export async function autoLinkContactsFromExtraction(
  documentId: string,
): Promise<{ created: number; linked: number } | null> {
  try {
    // Pull the document + processing result together
    const [doc] = await db
      .select({
        id: documents.id,
        caseId: documents.caseId,
        organizationId: documents.organizationId,
      })
      .from(documents)
      .where(
        and(eq(documents.id, documentId), isNull(documents.deletedAt)),
      )
      .limit(1);

    if (!doc || !doc.caseId) {
      logger.info("autoLinkContactsFromExtraction: no document or case", {
        documentId,
      });
      return null;
    }

    const [proc] = await db
      .select({
        aiClassification: documentProcessingResults.aiClassification,
      })
      .from(documentProcessingResults)
      .where(eq(documentProcessingResults.documentId, documentId))
      .orderBy(documentProcessingResults.createdAt)
      .limit(1);

    if (!proc?.aiClassification) {
      return { created: 0, linked: 0 };
    }

    const extractions =
      (
        proc.aiClassification as {
          extractions?: ExtractionRow[];
        }
      ).extractions ?? [];

    if (extractions.length === 0) {
      return { created: 0, linked: 0 };
    }

    // Dedupe by normalized (contactType, name) pair so we don't try to
    // insert the same person multiple times within one document.
    type Candidate = ContactTypeResolution & {
      firstName: string;
      lastName: string;
      attributes: Record<string, unknown> | undefined;
    };
    const seen = new Map<string, Candidate>();
    for (const ex of extractions) {
      const type = resolveType(ex.extraction_class);
      if (!type) continue;
      const name = normalizeName(ex.extraction_text);
      if (!name) continue;
      const key = `${type.contactType}::${name.firstName.toLowerCase()} ${name.lastName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.set(key, { ...type, ...name, attributes: ex.attributes });
    }

    let created = 0;
    let linked = 0;

    for (const candidate of seen.values()) {
      // Look up existing contact by (org, type, first, last) — case-insensitive
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, doc.organizationId),
            eq(contacts.contactType, candidate.contactType),
            sql`LOWER(${contacts.firstName}) = LOWER(${candidate.firstName})`,
            sql`LOWER(${contacts.lastName}) = LOWER(${candidate.lastName})`,
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);

      let contactId = existing?.id ?? null;

      if (!contactId) {
        const [ins] = await db
          .insert(contacts)
          .values({
            organizationId: doc.organizationId,
            firstName: candidate.firstName,
            lastName: candidate.lastName || "—",
            contactType: candidate.contactType,
            metadata: {
              autoLinked: true,
              sourceDocumentId: doc.id,
              attributes: candidate.attributes ?? null,
            },
          })
          .returning({ id: contacts.id });
        contactId = ins.id;
        created++;
      }

      // Link to case if not already linked (for this relationship)
      const [existingLink] = await db
        .select({ id: caseContacts.id })
        .from(caseContacts)
        .where(
          and(
            eq(caseContacts.caseId, doc.caseId),
            eq(caseContacts.contactId, contactId),
            eq(caseContacts.relationship, candidate.relationship),
          ),
        )
        .limit(1);

      if (!existingLink) {
        await db.insert(caseContacts).values({
          caseId: doc.caseId,
          contactId,
          relationship: candidate.relationship,
          isPrimary: false,
        });
        linked++;
      }
    }

    logger.info("autoLinkContactsFromExtraction complete", {
      documentId,
      created,
      linked,
      candidates: seen.size,
    });

    return { created, linked };
  } catch (err) {
    logger.error("autoLinkContactsFromExtraction failed", {
      documentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Auto-link an ALJ contact from ERE scraper webhook data.
 *
 * When the ERE scraper reports a new `adminLawJudge` name on a case,
 * this helper upserts the contact (type = ssa_judge) and links it to
 * the case. Uses case-insensitive name dedup to avoid duplicates.
 *
 * Best-effort: failures are logged and never thrown.
 */
export async function autoLinkJudgeFromScrapedData(input: {
  organizationId: string;
  caseId: string;
  adminLawJudge: string;
  hearingOffice?: string | null;
}): Promise<{ created: boolean; linked: boolean } | null> {
  try {
    const name = normalizeName(input.adminLawJudge);
    if (!name) return null;

    // Case-insensitive dedup lookup
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, input.organizationId),
          eq(contacts.contactType, "ssa_judge"),
          sql`LOWER(${contacts.firstName}) = LOWER(${name.firstName})`,
          sql`LOWER(${contacts.lastName}) = LOWER(${name.lastName})`,
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);

    let contactId = existing?.id ?? null;
    let created = false;

    if (!contactId) {
      const [ins] = await db
        .insert(contacts)
        .values({
          organizationId: input.organizationId,
          firstName: name.firstName,
          lastName: name.lastName || "—",
          contactType: "ssa_judge",
          metadata: {
            autoLinked: true,
            source: "ere_scraper",
            hearingOffice: input.hearingOffice ?? null,
          },
        })
        .returning({ id: contacts.id });
      contactId = ins.id;
      created = true;
    }

    // Link to case if not already linked
    const [existingLink] = await db
      .select({ id: caseContacts.id })
      .from(caseContacts)
      .where(
        and(
          eq(caseContacts.caseId, input.caseId),
          eq(caseContacts.contactId, contactId),
          eq(caseContacts.relationship, "judge"),
        ),
      )
      .limit(1);

    let linked = false;
    if (!existingLink) {
      await db.insert(caseContacts).values({
        caseId: input.caseId,
        contactId,
        relationship: "judge",
        isPrimary: false,
      });
      linked = true;
    }

    logger.info("autoLinkJudgeFromScrapedData complete", {
      caseId: input.caseId,
      adminLawJudge: input.adminLawJudge,
      created,
      linked,
    });

    return { created, linked };
  } catch (err) {
    logger.error("autoLinkJudgeFromScrapedData failed", {
      caseId: input.caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
