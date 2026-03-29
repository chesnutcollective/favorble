"use server";

import { db } from "@/db/drizzle";
import { medicalChronologyEntries, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, asc, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type ChronologyFilters = {
  entryType?: string;
  providerName?: string;
  startDate?: string;
  endDate?: string;
  verified?: boolean;
};

/**
 * Get chronology entries for a case with optional filters.
 */
export async function getChronologyEntries(
  caseId: string,
  filters?: ChronologyFilters,
) {
  await requireSession();

  const conditions = [eq(medicalChronologyEntries.caseId, caseId)];

  if (filters?.entryType) {
    conditions.push(
      eq(
        medicalChronologyEntries.entryType,
        filters.entryType as
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
          | "other",
      ),
    );
  }

  if (filters?.providerName) {
    conditions.push(
      eq(medicalChronologyEntries.providerName, filters.providerName),
    );
  }

  if (filters?.startDate) {
    conditions.push(
      gte(medicalChronologyEntries.eventDate, new Date(filters.startDate)),
    );
  }

  if (filters?.endDate) {
    conditions.push(
      lte(medicalChronologyEntries.eventDate, new Date(filters.endDate)),
    );
  }

  if (filters?.verified !== undefined) {
    conditions.push(eq(medicalChronologyEntries.isVerified, filters.verified));
  }

  return db
    .select()
    .from(medicalChronologyEntries)
    .where(and(...conditions))
    .orderBy(asc(medicalChronologyEntries.eventDate));
}

/**
 * Generate (or regenerate) a medical chronology for a case.
 */
export async function generateCaseChronology(
  caseId: string,
  regenerate?: boolean,
) {
  const session = await requireSession();

  // Verify case belongs to org
  const [caseRow] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!caseRow) throw new Error("Case not found");

  try {
    const { generateChronology } = await import(
      "@/lib/services/medical-chronology"
    );
    const result = await generateChronology({
      caseId,
      organizationId: session.organizationId,
      regenerate,
    });
    logger.info("Chronology generation initiated", {
      caseId,
      regenerate,
    });
    revalidatePath(`/cases/${caseId}`);
    return result;
  } catch (err) {
    logger.warn("Medical chronology service not available", {
      caseId,
      error: err,
    });
    throw new Error("Chronology generation service is not available");
  }
}

/**
 * Mark a single chronology entry as verified.
 */
export async function verifyChronologyEntry(entryId: string) {
  const session = await requireSession();

  const [entry] = await db
    .select({ caseId: medicalChronologyEntries.caseId })
    .from(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryId))
    .limit(1);

  if (!entry) throw new Error("Entry not found");

  await db
    .update(medicalChronologyEntries)
    .set({
      isVerified: true,
      verifiedBy: session.id,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(medicalChronologyEntries.id, entryId));

  revalidatePath(`/cases/${entry.caseId}`);
}

/**
 * Batch-verify multiple chronology entries.
 */
export async function batchVerifyEntries(entryIds: string[]) {
  const session = await requireSession();

  if (entryIds.length === 0) return;

  for (const entryId of entryIds) {
    await db
      .update(medicalChronologyEntries)
      .set({
        isVerified: true,
        verifiedBy: session.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(medicalChronologyEntries.id, entryId));
  }

  // Revalidate the case page — grab caseId from the first entry
  const [entry] = await db
    .select({ caseId: medicalChronologyEntries.caseId })
    .from(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryIds[0]))
    .limit(1);

  if (entry) {
    revalidatePath(`/cases/${entry.caseId}`);
  }
}

/**
 * Update a chronology entry's content.
 */
export async function updateChronologyEntry(
  entryId: string,
  data: {
    summary?: string;
    details?: string;
    eventDate?: string;
    providerName?: string;
    entryType?: string;
    diagnoses?: string[];
    treatments?: string[];
    medications?: string[];
  },
) {
  await requireSession();

  const [entry] = await db
    .select({ caseId: medicalChronologyEntries.caseId })
    .from(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryId))
    .limit(1);

  if (!entry) throw new Error("Entry not found");

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.summary !== undefined) updateData.summary = data.summary;
  if (data.details !== undefined) updateData.details = data.details;
  if (data.eventDate !== undefined)
    updateData.eventDate = new Date(data.eventDate);
  if (data.providerName !== undefined)
    updateData.providerName = data.providerName;
  if (data.entryType !== undefined) updateData.entryType = data.entryType;
  if (data.diagnoses !== undefined) updateData.diagnoses = data.diagnoses;
  if (data.treatments !== undefined) updateData.treatments = data.treatments;
  if (data.medications !== undefined) updateData.medications = data.medications;

  await db
    .update(medicalChronologyEntries)
    .set(updateData)
    .where(eq(medicalChronologyEntries.id, entryId));

  revalidatePath(`/cases/${entry.caseId}`);
}

/**
 * Toggle the isExcluded flag on a chronology entry.
 */
export async function excludeChronologyEntry(
  entryId: string,
  exclude: boolean,
) {
  await requireSession();

  const [entry] = await db
    .select({ caseId: medicalChronologyEntries.caseId })
    .from(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryId))
    .limit(1);

  if (!entry) throw new Error("Entry not found");

  await db
    .update(medicalChronologyEntries)
    .set({ isExcluded: exclude, updatedAt: new Date() })
    .where(eq(medicalChronologyEntries.id, entryId));

  revalidatePath(`/cases/${entry.caseId}`);
}

/**
 * Add a manual (non-AI) chronology entry.
 */
export async function addManualChronologyEntry(data: {
  caseId: string;
  entryType: string;
  eventDate: string;
  providerName: string;
  summary: string;
  details?: string;
  diagnoses?: string[];
  treatments?: string[];
  medications?: string[];
}) {
  const session = await requireSession();

  // Verify case belongs to org
  const [caseRow] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, data.caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!caseRow) throw new Error("Case not found");

  const [entry] = await db
    .insert(medicalChronologyEntries)
    .values({
      organizationId: session.organizationId,
      caseId: data.caseId,
      entryType: data.entryType as
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
        | "other",
      eventDate: new Date(data.eventDate),
      providerName: data.providerName,
      summary: data.summary,
      details: data.details,
      diagnoses: data.diagnoses,
      treatments: data.treatments,
      medications: data.medications,
      aiGenerated: false,
    })
    .returning();

  logger.info("Manual chronology entry added", {
    entryId: entry.id,
    caseId: data.caseId,
  });
  revalidatePath(`/cases/${data.caseId}`);
  return entry;
}

/**
 * Hard-delete a chronology entry (only if unverified).
 */
export async function deleteChronologyEntry(entryId: string) {
  await requireSession();

  const [entry] = await db
    .select({
      caseId: medicalChronologyEntries.caseId,
      isVerified: medicalChronologyEntries.isVerified,
    })
    .from(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryId))
    .limit(1);

  if (!entry) throw new Error("Entry not found");
  if (entry.isVerified) throw new Error("Cannot delete a verified entry");

  await db
    .delete(medicalChronologyEntries)
    .where(eq(medicalChronologyEntries.id, entryId));

  logger.info("Chronology entry deleted", { entryId });
  revalidatePath(`/cases/${entry.caseId}`);
}

/**
 * Export chronology entries for a case in the specified format.
 */
export async function exportChronology(caseId: string, format: "csv" | "json") {
  await requireSession();

  const entries = await db
    .select()
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.caseId, caseId),
        eq(medicalChronologyEntries.isExcluded, false),
      ),
    )
    .orderBy(asc(medicalChronologyEntries.eventDate));

  if (format === "json") {
    return {
      format: "json" as const,
      data: JSON.stringify(entries, null, 2),
      filename: `chronology-${caseId}.json`,
    };
  }

  // CSV export
  const headers = [
    "Date",
    "Entry Type",
    "Provider",
    "Summary",
    "Details",
    "Diagnoses",
    "Treatments",
    "Medications",
    "Verified",
  ];

  const rows = entries.map((e) => [
    e.eventDate ? new Date(e.eventDate).toISOString().split("T")[0] : "",
    e.entryType,
    e.providerName ?? "",
    `"${(e.summary ?? "").replace(/"/g, '""')}"`,
    `"${(e.details ?? "").replace(/"/g, '""')}"`,
    `"${(e.diagnoses ?? []).join("; ")}"`,
    `"${(e.treatments ?? []).join("; ")}"`,
    `"${(e.medications ?? []).join("; ")}"`,
    e.isVerified ? "Yes" : "No",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return {
    format: "csv" as const,
    data: csv,
    filename: `chronology-${caseId}.csv`,
  };
}
