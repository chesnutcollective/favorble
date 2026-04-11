"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  contacts,
  caseContacts,
  caseStages,
  caseStageTransitions,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, isNull, desc, asc, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type ParsedRow = Record<string, string>;

export type FieldMapping = {
  csvColumn: string;
  caseFlowField: string;
};

export type DuplicateCheck = {
  rowIndex: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  existingCaseId: string | null;
  existingCaseNumber: string | null;
};

export type ImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

// Note: CSV field mapping constants previously lived in `@/lib/import/fields`
// (split out because "use server" files can only export async functions in
// Next.js 16+). The import wizard UI has since been removed.

/**
 * Parse CSV content into an array of row objects.
 * Handles quoted fields and newlines within quotes.
 */
export async function parseCSV(
  fileContent: string,
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const lines = fileContent.split("\n");
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Detect potential duplicate cases by matching first name, last name,
 * and optionally date of birth against existing contacts.
 */
export async function detectDuplicates(
  rows: ParsedRow[],
  mappings: FieldMapping[],
): Promise<DuplicateCheck[]> {
  const session = await requireSession();

  const firstNameCol = mappings.find(
    (m) => m.caseFlowField === "firstName",
  )?.csvColumn;
  const lastNameCol = mappings.find(
    (m) => m.caseFlowField === "lastName",
  )?.csvColumn;
  const dobCol = mappings.find(
    (m) => m.caseFlowField === "dateOfBirth",
  )?.csvColumn;

  if (!firstNameCol || !lastNameCol) {
    return [];
  }

  const duplicates: DuplicateCheck[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstName = row[firstNameCol] ?? "";
    const lastName = row[lastNameCol] ?? "";
    const dob = dobCol ? (row[dobCol] ?? null) : null;

    if (!firstName || !lastName) continue;

    // Search for existing contacts with matching name
    const existing = await db
      .select({
        contactId: contacts.id,
        caseId: caseContacts.caseId,
        caseNumber: cases.caseNumber,
      })
      .from(contacts)
      .innerJoin(caseContacts, eq(caseContacts.contactId, contacts.id))
      .innerJoin(cases, eq(caseContacts.caseId, cases.id))
      .where(
        and(
          eq(contacts.organizationId, session.organizationId),
          ilike(contacts.firstName, firstName),
          ilike(contacts.lastName, lastName),
          isNull(contacts.deletedAt),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      duplicates.push({
        rowIndex: i,
        firstName,
        lastName,
        dateOfBirth: dob,
        existingCaseId: existing[0].caseId,
        existingCaseNumber: existing[0].caseNumber,
      });
    }
  }

  return duplicates;
}

/**
 * Bulk create cases from mapped CSV rows.
 * Creates contacts, cases, links them, and sets custom field values.
 */
export async function bulkCreateCases(
  rows: ParsedRow[],
  mappings: FieldMapping[],
  skipDuplicateIndices: number[] = [],
): Promise<ImportResult> {
  const session = await requireSession();
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  // Get the initial stage for new cases
  const [initialStageRow] = await db
    .select({ id: caseStages.id })
    .from(caseStages)
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        eq(caseStages.isInitial, true),
        isNull(caseStages.deletedAt),
      ),
    )
    .limit(1);

  let initialStageId = initialStageRow?.id;

  if (!initialStageId) {
    // Fall back to first stage by display order
    const [firstStage] = await db
      .select({ id: caseStages.id })
      .from(caseStages)
      .where(
        and(
          eq(caseStages.organizationId, session.organizationId),
          isNull(caseStages.deletedAt),
        ),
      )
      .orderBy(asc(caseStages.displayOrder))
      .limit(1);

    if (!firstStage) {
      return {
        created: 0,
        skipped: rows.length,
        errors: [
          "No stages configured. Please set up stages before importing.",
        ],
      };
    }
    initialStageId = firstStage.id;
  }

  // Build a lookup for field mappings
  const fieldMap = new Map<string, string>();
  for (const m of mappings) {
    if (m.caseFlowField && m.csvColumn) {
      fieldMap.set(m.caseFlowField, m.csvColumn);
    }
  }

  // Get the latest case number to continue the sequence
  const [lastCase] = await db
    .select({ caseNumber: cases.caseNumber })
    .from(cases)
    .where(eq(cases.organizationId, session.organizationId))
    .orderBy(desc(cases.createdAt))
    .limit(1);

  let nextNum = lastCase
    ? Number.parseInt(lastCase.caseNumber.replace(/\D/g, ""), 10) + 1
    : 1001;

  const contactFields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "zip",
  ];
  const caseFields = [
    "ssaClaimNumber",
    "ssaOffice",
    "applicationTypePrimary",
    "applicationTypeSecondary",
    "hearingOffice",
    "adminLawJudge",
  ];
  const dateFields = ["dateOfBirth", "allegedOnsetDate", "dateLastInsured"];

  for (let i = 0; i < rows.length; i++) {
    if (skipDuplicateIndices.includes(i)) {
      result.skipped++;
      continue;
    }

    const row = rows[i];

    try {
      // Extract mapped values
      const getValue = (field: string): string =>
        fieldMap.has(field) ? (row[fieldMap.get(field)!] ?? "") : "";

      const firstName = getValue("firstName");
      const lastName = getValue("lastName");

      if (!firstName || !lastName) {
        result.errors.push(
          `Row ${i + 1}: Missing first or last name. Skipped.`,
        );
        result.skipped++;
        continue;
      }

      // Create contact
      const contactData: Record<string, unknown> = {
        organizationId: session.organizationId,
        firstName,
        lastName,
        contactType: "claimant",
        createdBy: session.id,
      };

      for (const field of contactFields) {
        if (field === "firstName" || field === "lastName") continue;
        const val = getValue(field);
        if (val) contactData[field] = val;
      }

      const [contact] = await db
        .insert(contacts)
        .values(contactData as typeof contacts.$inferInsert)
        .returning();

      // Create case
      const caseNumber = `CF-${nextNum}`;
      nextNum++;

      const caseData: Record<string, unknown> = {
        organizationId: session.organizationId,
        caseNumber,
        currentStageId: initialStageId,
        createdBy: session.id,
        updatedBy: session.id,
      };

      for (const field of caseFields) {
        const val = getValue(field);
        if (val) caseData[field] = val;
      }

      for (const field of dateFields) {
        const val = getValue(field);
        if (val) {
          const parsed = new Date(val);
          if (!Number.isNaN(parsed.getTime())) {
            caseData[field] = parsed;
          }
        }
      }

      const [newCase] = await db
        .insert(cases)
        .values(caseData as typeof cases.$inferInsert)
        .returning();

      // Link contact to case
      await db.insert(caseContacts).values({
        caseId: newCase.id,
        contactId: contact.id,
        relationship: "claimant",
        isPrimary: true,
      });

      // Log initial stage transition
      await db.insert(caseStageTransitions).values({
        caseId: newCase.id,
        toStageId: initialStageId,
        transitionedBy: session.id,
      });

      result.created++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Row ${i + 1}: ${message}`);
      result.skipped++;
    }
  }

  logger.info("Bulk import completed", {
    created: result.created,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  revalidatePath("/cases");
  return result;
}
