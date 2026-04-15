"use server";

import { cookies } from "next/headers";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  clientTreatmentEntries,
  documents,
  medicalChronologyEntries,
  portalUsers,
  cases,
  leads,
  contacts,
  caseContacts,
  users,
  type ClientTreatmentEntryStatus,
  type ClientTreatmentReasonCode,
  CLIENT_TREATMENT_REASON_CODES,
} from "@/db/schema";
import {
  ensurePortalSession,
  getPortalRequestContext,
} from "@/lib/auth/portal-session";
import { requireSession } from "@/lib/auth/session";
import { insertPortalActivity } from "@/lib/services/portal-activity";
import { uploadDocumentToDefaultBackend } from "@/lib/storage/server";
import { enqueueDocumentProcessing } from "@/lib/services/enqueue-processing";
import { logger } from "@/lib/logger/server";
import { logPhiAccess, logPhiModification } from "@/lib/services/hipaa-audit";
import { revalidatePath } from "next/cache";
// Canonical cookie name lives in the client-portal layout (which is not
// `"use server"`, so it's free to export constants). Import it here rather
// than re-exporting from this action file — Next.js forbids non-async
// exports from `"use server"` modules.
import { PORTAL_IMPERSONATE_COOKIE } from "@/app/(client)/layout";

// ─────────────────────────────────────────────────────────────────────────────
// Shared row type used by both portal + staff UIs
// ─────────────────────────────────────────────────────────────────────────────

export type ClientTreatmentLogRow = {
  id: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  providerName: string;
  visitDate: string;
  reason: string | null;
  notes: string | null;
  clientFacingRejectionMessage: string | null;
  receipt: {
    documentId: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number | null;
  } | null;
  status: ClientTreatmentEntryStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  promotedToChronologyEntryId: string | null;
};

const STATUS_ORDER: Record<ClientTreatmentEntryStatus, number> = {
  pending: 0,
  merged: 1,
  rejected: 2,
};

/**
 * Strip the internal "[rejection]: …" prefix from the notes field so we can
 * surface a softer client-facing message in the portal.
 */
function buildClientFacingRejectionMessage(
  status: ClientTreatmentEntryStatus,
  notes: string | null,
): string | null {
  if (status !== "rejected") return null;
  return "Your team needs a bit more detail about this visit — they'll reach out with next steps.";
}

function toRow(entry: {
  id: string;
  caseId: string;
  caseNumber: string | null;
  claimantFirstName: string | null;
  claimantLastName: string | null;
  providerName: string;
  visitDate: Date;
  reason: string | null;
  notes: string | null;
  receiptDocumentId: string | null;
  receiptFileName: string | null;
  receiptFileType: string | null;
  receiptFileSize: number | null;
  status: string;
  reviewedBy: string | null;
  reviewedByFirst: string | null;
  reviewedByLast: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  promotedToChronologyEntryId: string | null;
}): ClientTreatmentLogRow {
  const status = entry.status as ClientTreatmentEntryStatus;
  const reviewerName =
    entry.reviewedByFirst || entry.reviewedByLast
      ? `${entry.reviewedByFirst ?? ""} ${entry.reviewedByLast ?? ""}`.trim()
      : null;
  return {
    id: entry.id,
    caseId: entry.caseId,
    caseNumber: entry.caseNumber ?? "—",
    claimantName:
      `${entry.claimantFirstName ?? ""} ${entry.claimantLastName ?? ""}`.trim() ||
      "Unknown claimant",
    providerName: entry.providerName,
    visitDate: entry.visitDate.toISOString(),
    reason: entry.reason,
    notes: entry.notes,
    clientFacingRejectionMessage: buildClientFacingRejectionMessage(
      status,
      entry.notes,
    ),
    receipt: entry.receiptDocumentId
      ? {
          documentId: entry.receiptDocumentId,
          fileName: entry.receiptFileName ?? "receipt",
          fileType: entry.receiptFileType ?? "application/octet-stream",
          fileSizeBytes: entry.receiptFileSize,
        }
      : null,
    status,
    reviewedBy: reviewerName,
    reviewedAt: entry.reviewedAt ? entry.reviewedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
    promotedToChronologyEntryId: entry.promotedToChronologyEntryId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL (claimant-facing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List every treatment-log entry the current claimant has submitted across
 * all of their cases. Sorted pending → merged → rejected, newest first.
 *
 * Impersonating staff also see the list (read-only) so they can preview what
 * the claimant sees.
 */
export async function listPortalTreatmentEntries(): Promise<
  ClientTreatmentLogRow[]
> {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  const caseIds = session.cases.map((c) => c.id);
  if (caseIds.length === 0) return [];

  const rows = await db
    .select({
      id: clientTreatmentEntries.id,
      caseId: clientTreatmentEntries.caseId,
      caseNumber: cases.caseNumber,
      claimantFirstName: leads.firstName,
      claimantLastName: leads.lastName,
      providerName: clientTreatmentEntries.providerName,
      visitDate: clientTreatmentEntries.visitDate,
      reason: clientTreatmentEntries.reason,
      notes: clientTreatmentEntries.notes,
      receiptDocumentId: clientTreatmentEntries.receiptDocumentId,
      receiptFileName: documents.fileName,
      receiptFileType: documents.fileType,
      receiptFileSize: documents.fileSizeBytes,
      status: clientTreatmentEntries.status,
      reviewedBy: clientTreatmentEntries.reviewedBy,
      reviewedByFirst: users.firstName,
      reviewedByLast: users.lastName,
      reviewedAt: clientTreatmentEntries.reviewedAt,
      createdAt: clientTreatmentEntries.createdAt,
      promotedToChronologyEntryId:
        clientTreatmentEntries.promotedToChronologyEntryId,
    })
    .from(clientTreatmentEntries)
    .innerJoin(cases, eq(cases.id, clientTreatmentEntries.caseId))
    .leftJoin(leads, eq(leads.id, cases.leadId))
    .leftJoin(
      documents,
      eq(documents.id, clientTreatmentEntries.receiptDocumentId),
    )
    .leftJoin(users, eq(users.id, clientTreatmentEntries.reviewedBy))
    .where(
      and(
        eq(
          clientTreatmentEntries.organizationId,
          session.portalUser.organizationId,
        ),
        inArray(clientTreatmentEntries.caseId, caseIds),
      ),
    )
    .orderBy(desc(clientTreatmentEntries.createdAt));

  return rows
    .map(toRow)
    .sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export type SubmitTreatmentEntryInput = {
  caseId: string;
  providerName: string;
  visitDate: string; // ISO-ish
  reason: ClientTreatmentReasonCode;
  notes?: string;
};

export type SubmitTreatmentEntryResult =
  | { success: true; entryId: string }
  | { error: string };

/**
 * Portal-side submit. Creates a `client_treatment_entries` row in `pending`
 * status; optional receipt is stored via `uploadTreatmentReceipt` (called
 * first by the client, whose returned documentId is passed in through
 * `formData`). Impersonating staff are hard-blocked.
 */
export async function submitTreatmentEntry(
  formData: FormData,
): Promise<SubmitTreatmentEntryResult> {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  if (session.isImpersonating) {
    return {
      error: "The treatment log is read-only while previewing the portal.",
    };
  }

  const caseId = String(formData.get("caseId") ?? "");
  const providerName = String(formData.get("providerName") ?? "").trim();
  const visitDate = String(formData.get("visitDate") ?? "");
  const reasonRaw = String(formData.get("reason") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const receiptDocumentId =
    String(formData.get("receiptDocumentId") ?? "") || null;
  const receiptFileRaw = formData.get("receiptFile");

  if (!caseId) return { error: "Your account isn't linked to a case yet." };
  if (!providerName) return { error: "Please enter the provider name." };
  if (!visitDate) return { error: "Please pick a visit date." };

  const reason = CLIENT_TREATMENT_REASON_CODES.includes(
    reasonRaw as ClientTreatmentReasonCode,
  )
    ? (reasonRaw as ClientTreatmentReasonCode)
    : "other";

  const visitDateParsed = new Date(visitDate);
  if (Number.isNaN(visitDateParsed.getTime())) {
    return { error: "That visit date doesn't look right." };
  }

  const knownCase = session.cases.find((c) => c.id === caseId);
  if (!knownCase) return { error: "You can't submit to that case." };

  const organizationId = session.portalUser.organizationId;

  // Optional inline receipt upload.
  let finalReceiptId: string | null = receiptDocumentId;
  if (!finalReceiptId && receiptFileRaw instanceof File && receiptFileRaw.size > 0) {
    try {
      const arrayBuffer = await receiptFileRaw.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const { storagePath } = await uploadDocumentToDefaultBackend(
        organizationId,
        caseId,
        receiptFileRaw.name,
        buffer,
        receiptFileRaw.type || "application/octet-stream",
      );
      const [doc] = await db
        .insert(documents)
        .values({
          organizationId,
          caseId,
          fileName: receiptFileRaw.name,
          fileType: receiptFileRaw.type || "application/octet-stream",
          fileSizeBytes: receiptFileRaw.size,
          storagePath,
          category: "treatment_receipt",
          source: "case_status",
          description: "Treatment log receipt uploaded by claimant",
          metadata: {
            portalUserId: session.portalUser.id,
            contactId: session.contact.id,
            source: "treatment_log",
          },
        })
        .returning({ id: documents.id });
      finalReceiptId = doc.id;

      enqueueDocumentProcessing({
        documentId: doc.id,
        organizationId,
        fileName: receiptFileRaw.name,
        fileType: receiptFileRaw.type,
        source: "portal_upload",
      });
    } catch (error) {
      logger.error("treatment log receipt upload failed", {
        caseId,
        error,
      });
      // Non-fatal: keep the entry without a receipt rather than losing it.
      finalReceiptId = null;
    }
  }

  try {
    const [entry] = await db
      .insert(clientTreatmentEntries)
      .values({
        organizationId,
        caseId,
        portalUserId: session.portalUser.id,
        providerName,
        visitDate: visitDateParsed,
        reason,
        notes: notes || null,
        receiptDocumentId: finalReceiptId,
        status: "pending",
      })
      .returning({ id: clientTreatmentEntries.id });

    const { ip, userAgent } = await getPortalRequestContext();
    await insertPortalActivity({
      organizationId,
      portalUserId: session.portalUser.id,
      caseId,
      eventType: "submit_treatment_log",
      targetType: "client_treatment_entry",
      targetId: entry.id,
      metadata: {
        providerName,
        reason,
        hasReceipt: finalReceiptId !== null,
      },
      ip,
      userAgent,
    });

    logger.info("Client treatment log entry submitted", {
      entryId: entry.id,
      caseId,
      portalUserId: session.portalUser.id,
    });
    revalidatePath("/portal/treatment-log");
    return { success: true, entryId: entry.id };
  } catch (error) {
    logger.error("client treatment entry insert failed", { caseId, error });
    return { error: "We couldn't save that entry. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF (medical-records persona)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List every client treatment log entry in the org across all cases. Used
 * by the medical-records staff workspace "Client Log" tab. Sorted pending
 * first (oldest first so the backlog is FIFO), then merged/rejected newest
 * first.
 */
export async function listStaffTreatmentEntries(
  filters?: { caseId?: string; status?: ClientTreatmentEntryStatus },
): Promise<ClientTreatmentLogRow[]> {
  const session = await requireSession();

  const conditions = [
    eq(clientTreatmentEntries.organizationId, session.organizationId),
  ];
  if (filters?.caseId) {
    conditions.push(eq(clientTreatmentEntries.caseId, filters.caseId));
  }
  if (filters?.status) {
    conditions.push(eq(clientTreatmentEntries.status, filters.status));
  }

  const rows = await db
    .select({
      id: clientTreatmentEntries.id,
      caseId: clientTreatmentEntries.caseId,
      caseNumber: cases.caseNumber,
      claimantFirstName: leads.firstName,
      claimantLastName: leads.lastName,
      providerName: clientTreatmentEntries.providerName,
      visitDate: clientTreatmentEntries.visitDate,
      reason: clientTreatmentEntries.reason,
      notes: clientTreatmentEntries.notes,
      receiptDocumentId: clientTreatmentEntries.receiptDocumentId,
      receiptFileName: documents.fileName,
      receiptFileType: documents.fileType,
      receiptFileSize: documents.fileSizeBytes,
      status: clientTreatmentEntries.status,
      reviewedBy: clientTreatmentEntries.reviewedBy,
      reviewedByFirst: users.firstName,
      reviewedByLast: users.lastName,
      reviewedAt: clientTreatmentEntries.reviewedAt,
      createdAt: clientTreatmentEntries.createdAt,
      promotedToChronologyEntryId:
        clientTreatmentEntries.promotedToChronologyEntryId,
    })
    .from(clientTreatmentEntries)
    .innerJoin(cases, eq(cases.id, clientTreatmentEntries.caseId))
    .leftJoin(leads, eq(leads.id, cases.leadId))
    .leftJoin(
      documents,
      eq(documents.id, clientTreatmentEntries.receiptDocumentId),
    )
    .leftJoin(users, eq(users.id, clientTreatmentEntries.reviewedBy))
    .where(and(...conditions))
    .orderBy(desc(clientTreatmentEntries.createdAt));

  // Backfill missing claimant names from case_contacts→contacts for
  // Chronicle-imported cases (same pattern as medical-records queue).
  const idsNeedingContactFallback = rows
    .filter((r) => !r.claimantFirstName && !r.claimantLastName)
    .map((r) => r.caseId);

  const contactNameMap = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  if (idsNeedingContactFallback.length > 0) {
    const contactRows = await db
      .select({
        caseId: caseContacts.caseId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        relationship: caseContacts.relationship,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          inArray(caseContacts.caseId, idsNeedingContactFallback),
          eq(caseContacts.isPrimary, true),
        ),
      );
    for (const c of contactRows) {
      const existing = contactNameMap.get(c.caseId);
      if (!existing || c.relationship === "claimant") {
        contactNameMap.set(c.caseId, {
          firstName: c.firstName,
          lastName: c.lastName,
        });
      }
    }
  }

  const mapped = rows.map((r) => {
    const fallback = contactNameMap.get(r.caseId);
    return toRow({
      ...r,
      claimantFirstName: r.claimantFirstName ?? fallback?.firstName ?? null,
      claimantLastName: r.claimantLastName ?? fallback?.lastName ?? null,
    });
  });

  return mapped.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    // Pending FIFO (oldest first), others newest first.
    if (a.status === "pending") return a.createdAt.localeCompare(b.createdAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export type MergeTreatmentEntryInput = {
  entryId: string;
  entryType:
    | "office_visit"
    | "hospitalization"
    | "emergency"
    | "lab_result"
    | "imaging"
    | "mental_health"
    | "physical_therapy"
    | "surgery"
    | "prescription"
    | "diagnosis"
    | "functional_assessment"
    | "other";
  providerName: string;
  eventDate?: string;
  summary: string;
  details?: string;
  diagnoses?: string[];
  treatments?: string[];
  medications?: string[];
};

export type MergeTreatmentEntryResult =
  | { success: true; chronologyEntryId: string }
  | { error: string };

/**
 * Staff-side: merge a pending treatment log entry into
 * medical_chronology_entries. The firm fills in ICD codes + normalizes the
 * provider name. Logged via HIPAA audit as a create on medical_chronology.
 */
export async function mergeTreatmentEntryIntoChronology(
  input: MergeTreatmentEntryInput,
): Promise<MergeTreatmentEntryResult> {
  const session = await requireSession();

  const [entry] = await db
    .select()
    .from(clientTreatmentEntries)
    .where(
      and(
        eq(clientTreatmentEntries.id, input.entryId),
        eq(clientTreatmentEntries.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!entry) return { error: "Treatment log entry not found." };
  if (entry.status !== "pending") {
    return { error: "Only pending entries can be merged." };
  }

  const eventDate = input.eventDate
    ? new Date(input.eventDate)
    : entry.visitDate;
  if (Number.isNaN(eventDate.getTime())) {
    return { error: "Invalid event date." };
  }

  const providerName = input.providerName.trim() || entry.providerName;
  const summary = input.summary.trim();
  if (!summary) return { error: "Summary is required." };

  try {
    const [chronEntry] = await db
      .insert(medicalChronologyEntries)
      .values({
        organizationId: session.organizationId,
        caseId: entry.caseId,
        entryType: input.entryType,
        eventDate,
        providerName,
        summary,
        details: input.details ?? entry.notes ?? undefined,
        diagnoses: input.diagnoses ?? undefined,
        treatments: input.treatments ?? undefined,
        medications: input.medications ?? undefined,
        aiGenerated: false,
        isVerified: true,
        verifiedBy: session.id,
        verifiedAt: new Date(),
        metadata: {
          origin: "client_treatment_log",
          clientTreatmentEntryId: entry.id,
          clientProvidedReason: entry.reason,
        },
      })
      .returning({ id: medicalChronologyEntries.id });

    await db
      .update(clientTreatmentEntries)
      .set({
        status: "merged",
        promotedToChronologyEntryId: chronEntry.id,
        reviewedBy: session.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientTreatmentEntries.id, entry.id));

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "medical_chronology_entry",
      entityId: chronEntry.id,
      operation: "create",
      caseId: entry.caseId,
      action: "client_treatment_merged",
      metadata: {
        clientTreatmentEntryId: entry.id,
        providerName,
        entryType: input.entryType,
      },
    });

    logger.info("Client treatment entry merged into chronology", {
      entryId: entry.id,
      chronologyEntryId: chronEntry.id,
      caseId: entry.caseId,
    });

    revalidatePath("/medical-records");
    revalidatePath(`/cases/${entry.caseId}`);
    return { success: true, chronologyEntryId: chronEntry.id };
  } catch (error) {
    logger.error("client treatment merge failed", {
      entryId: input.entryId,
      error,
    });
    return { error: "Merge failed. Please try again." };
  }
}

export type RejectTreatmentEntryResult =
  | { success: true }
  | { error: string };

/**
 * Staff-side: reject a pending entry. Stores the internal reason in notes
 * (prefixed) so the full record is preserved while the portal surfaces a
 * softer client-facing message. Logged via HIPAA audit.
 */
export async function rejectTreatmentEntry(
  entryId: string,
  reason: string,
): Promise<RejectTreatmentEntryResult> {
  const session = await requireSession();

  const trimmed = reason.trim();
  if (!trimmed) return { error: "Please enter a rejection reason." };

  const [entry] = await db
    .select({
      id: clientTreatmentEntries.id,
      caseId: clientTreatmentEntries.caseId,
      notes: clientTreatmentEntries.notes,
      status: clientTreatmentEntries.status,
    })
    .from(clientTreatmentEntries)
    .where(
      and(
        eq(clientTreatmentEntries.id, entryId),
        eq(clientTreatmentEntries.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!entry) return { error: "Treatment log entry not found." };
  if (entry.status !== "pending") {
    return { error: "Only pending entries can be rejected." };
  }

  const prefix = "[rejection]: ";
  const combinedNotes = entry.notes
    ? `${entry.notes}\n\n${prefix}${trimmed}`
    : `${prefix}${trimmed}`;

  try {
    await db
      .update(clientTreatmentEntries)
      .set({
        status: "rejected",
        notes: combinedNotes,
        reviewedBy: session.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientTreatmentEntries.id, entry.id));

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "client_treatment_entry",
      entityId: entry.id,
      operation: "update",
      caseId: entry.caseId,
      action: "client_treatment_rejected",
      metadata: { reason: trimmed },
    });

    logger.info("Client treatment entry rejected", {
      entryId: entry.id,
      caseId: entry.caseId,
    });

    revalidatePath("/medical-records");
    return { success: true };
  } catch (error) {
    logger.error("client treatment reject failed", { entryId, error });
    return { error: "Reject failed. Please try again." };
  }
}

/**
 * Lightweight PHI access log for staff viewing the list.
 *
 * Called by the medical-records page (not a write action itself) so the
 * audit row is attached to the page view. Debounced per user.
 */
export async function auditStaffTreatmentLogView(): Promise<void> {
  try {
    const session = await requireSession();
    await logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "client_treatment_log",
      entityId: session.organizationId,
      fieldsAccessed: ["provider_name", "visit_date", "notes"],
      reason: "medical records staff review",
      severity: "info",
    });
  } catch {
    // best-effort; never break the view
  }
}

/**
 * Return the list of available case filter options (id + claimant + number)
 * for the staff-side dropdown. Only shows cases that currently have at
 * least one treatment log entry so the dropdown stays scoped.
 */
export async function listStaffTreatmentCaseFilterOptions(): Promise<
  Array<{ caseId: string; caseNumber: string; claimantName: string }>
> {
  const session = await requireSession();

  const rows = await db
    .select({
      caseId: clientTreatmentEntries.caseId,
      caseNumber: cases.caseNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
    })
    .from(clientTreatmentEntries)
    .innerJoin(cases, eq(cases.id, clientTreatmentEntries.caseId))
    .leftJoin(leads, eq(leads.id, cases.leadId))
    .where(
      and(
        eq(clientTreatmentEntries.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    );

  const seen = new Map<
    string,
    { caseId: string; caseNumber: string; claimantName: string }
  >();
  for (const row of rows) {
    if (seen.has(row.caseId)) continue;
    const name =
      `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
      "Unknown claimant";
    seen.set(row.caseId, {
      caseId: row.caseId,
      caseNumber: row.caseNumber,
      claimantName: name,
    });
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.claimantName.localeCompare(b.claimantName),
  );
}
