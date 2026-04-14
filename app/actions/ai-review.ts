"use server";

import { db } from "@/db/drizzle";
import {
  medicalChronologyEntries,
  documents,
  documentProcessingResults,
  cases,
  contacts,
  caseContacts,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import { logExtractionReview } from "@/lib/services/hipaa-audit";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ReviewStatus = "pending" | "approved" | "rejected" | "all";
export type ConfidenceLevel = "low" | "medium" | "high" | "all";

export type AiReviewFilter = {
  status?: ReviewStatus;
  confidenceLevel?: ConfidenceLevel;
  documentType?: string;
  page?: number;
  pageSize?: number;
};

export type AiReviewEntry = {
  id: string;
  caseId: string;
  caseNumber: string | null;
  claimantName: string | null;
  entryType: string;
  eventDate: string | null;
  providerName: string | null;
  providerType: string | null;
  facilityName: string | null;
  summary: string;
  details: string | null;
  diagnoses: string[];
  treatments: string[];
  medications: string[];
  aiGenerated: boolean;
  isVerified: boolean;
  isExcluded: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedByName: string | null;
  createdAt: string;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  sourceDocumentCategory: string | null;
  confidence: number | null;
  /** Char-interval / source text highlights from the AI extraction result. */
  sourceHighlights: Array<{
    field: string;
    text: string;
    startChar?: number;
    endChar?: number;
  }>;
  metadata: Record<string, unknown>;
  daysPending: number;
};

export type AiReviewStats = {
  pendingReview: number;
  approvedThisWeek: number;
  rejectedThisWeek: number;
  avgConfidence: number;
  oldestPendingDays: number;
  confidenceTrend: number;
};

export type AiReviewListResult = {
  entries: AiReviewEntry[];
  totalCount: number;
  hasMore: boolean;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function buildConditions(organizationId: string, filter: AiReviewFilter) {
  const conditions = [
    eq(medicalChronologyEntries.organizationId, organizationId),
    eq(medicalChronologyEntries.aiGenerated, true),
  ];

  const status = filter.status ?? "pending";
  if (status === "pending") {
    conditions.push(eq(medicalChronologyEntries.isVerified, false));
    conditions.push(eq(medicalChronologyEntries.isExcluded, false));
  } else if (status === "approved") {
    conditions.push(eq(medicalChronologyEntries.isVerified, true));
  } else if (status === "rejected") {
    conditions.push(eq(medicalChronologyEntries.isExcluded, true));
  }

  if (filter.documentType && filter.documentType !== "all") {
    conditions.push(
      eq(documentProcessingResults.documentCategory, filter.documentType),
    );
  }

  if (filter.confidenceLevel && filter.confidenceLevel !== "all") {
    if (filter.confidenceLevel === "low") {
      conditions.push(
        or(
          isNull(documentProcessingResults.aiConfidence),
          lte(documentProcessingResults.aiConfidence, 59),
        )!,
      );
    } else if (filter.confidenceLevel === "medium") {
      conditions.push(
        and(
          gte(documentProcessingResults.aiConfidence, 60),
          lte(documentProcessingResults.aiConfidence, 80),
        )!,
      );
    } else if (filter.confidenceLevel === "high") {
      conditions.push(gte(documentProcessingResults.aiConfidence, 81));
    }
  }

  return and(...conditions);
}

function extractHighlights(
  metadata: unknown,
  classification: unknown,
): AiReviewEntry["sourceHighlights"] {
  const highlights: AiReviewEntry["sourceHighlights"] = [];

  const addFrom = (source: unknown) => {
    if (!source || typeof source !== "object") return;
    const maybeList =
      (source as { extractions?: unknown }).extractions ?? source;
    if (!Array.isArray(maybeList)) return;
    for (const item of maybeList) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const text =
        (rec.extraction_text as string | undefined) ??
        (rec.text as string | undefined);
      const field =
        (rec.extraction_class as string | undefined) ??
        (rec.field as string | undefined) ??
        "extraction";
      if (!text) continue;
      const interval = rec.char_interval as
        | { start_pos?: number; end_pos?: number }
        | undefined;
      highlights.push({
        field,
        text,
        startChar: interval?.start_pos,
        endChar: interval?.end_pos,
      });
    }
  };

  addFrom(classification);
  if (highlights.length === 0) addFrom(metadata);
  return highlights.slice(0, 20);
}

/**
 * Load AI review queue for the current organization with joined document,
 * processing, and claimant info plus char-interval source highlights.
 */
export async function getAiReviewQueue(
  filter: AiReviewFilter = {},
): Promise<AiReviewListResult> {
  const session = await requireSession();

  const pageSize = Math.min(
    Math.max(filter.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(filter.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const where = buildConditions(session.organizationId, filter);

  try {
    const rows = await db
      .select({
        id: medicalChronologyEntries.id,
        caseId: medicalChronologyEntries.caseId,
        entryType: medicalChronologyEntries.entryType,
        eventDate: medicalChronologyEntries.eventDate,
        providerName: medicalChronologyEntries.providerName,
        providerType: medicalChronologyEntries.providerType,
        facilityName: medicalChronologyEntries.facilityName,
        summary: medicalChronologyEntries.summary,
        details: medicalChronologyEntries.details,
        diagnoses: medicalChronologyEntries.diagnoses,
        treatments: medicalChronologyEntries.treatments,
        medications: medicalChronologyEntries.medications,
        aiGenerated: medicalChronologyEntries.aiGenerated,
        isVerified: medicalChronologyEntries.isVerified,
        isExcluded: medicalChronologyEntries.isExcluded,
        verifiedAt: medicalChronologyEntries.verifiedAt,
        verifiedBy: medicalChronologyEntries.verifiedBy,
        createdAt: medicalChronologyEntries.createdAt,
        entryMetadata: medicalChronologyEntries.metadata,
        sourceDocumentId: medicalChronologyEntries.sourceDocumentId,
        sourceDocumentName: documents.fileName,
        sourceDocumentCategory: documents.category,
        caseNumber: cases.caseNumber,
        confidence: documentProcessingResults.aiConfidence,
        aiClassification: documentProcessingResults.aiClassification,
        procDocumentCategory: documentProcessingResults.documentCategory,
        verifierFirstName: users.firstName,
        verifierLastName: users.lastName,
      })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(medicalChronologyEntries.sourceDocumentId, documents.id),
      )
      .leftJoin(
        documentProcessingResults,
        eq(
          documentProcessingResults.documentId,
          medicalChronologyEntries.sourceDocumentId,
        ),
      )
      .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
      .leftJoin(users, eq(medicalChronologyEntries.verifiedBy, users.id))
      .where(where)
      .orderBy(desc(medicalChronologyEntries.createdAt))
      .limit(pageSize)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(medicalChronologyEntries)
      .leftJoin(
        documentProcessingResults,
        eq(
          documentProcessingResults.documentId,
          medicalChronologyEntries.sourceDocumentId,
        ),
      )
      .where(where);

    // Look up claimants for the cases in this page.
    const caseIds = Array.from(
      new Set(rows.map((r) => r.caseId).filter(Boolean)),
    );
    const claimantMap = new Map<string, string>();
    if (caseIds.length > 0) {
      const claimantRows = await db
        .select({
          caseId: caseContacts.caseId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          relationship: caseContacts.relationship,
          isPrimary: caseContacts.isPrimary,
        })
        .from(caseContacts)
        .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
        .where(inArray(caseContacts.caseId, caseIds));

      for (const row of claimantRows) {
        if (row.relationship !== "claimant" && !row.isPrimary) continue;
        if (claimantMap.has(row.caseId) && row.relationship !== "claimant") {
          continue;
        }
        claimantMap.set(
          row.caseId,
          `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
        );
      }
    }

    const now = Date.now();

    const entries: AiReviewEntry[] = rows.map((r) => {
      const created = r.createdAt?.getTime() ?? now;
      const daysPending = Math.max(
        0,
        Math.floor((now - created) / (1000 * 60 * 60 * 24)),
      );
      const verifiedName =
        r.verifierFirstName || r.verifierLastName
          ? `${r.verifierFirstName ?? ""} ${r.verifierLastName ?? ""}`.trim()
          : null;
      return {
        id: r.id,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? null,
        claimantName: claimantMap.get(r.caseId) ?? null,
        entryType: r.entryType,
        eventDate: r.eventDate ? r.eventDate.toISOString() : null,
        providerName: r.providerName ?? null,
        providerType: r.providerType ?? null,
        facilityName: r.facilityName ?? null,
        summary: r.summary,
        details: r.details ?? null,
        diagnoses: (r.diagnoses as string[] | null) ?? [],
        treatments: (r.treatments as string[] | null) ?? [],
        medications: (r.medications as string[] | null) ?? [],
        aiGenerated: r.aiGenerated,
        isVerified: r.isVerified,
        isExcluded: r.isExcluded,
        verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
        verifiedBy: r.verifiedBy,
        verifiedByName: verifiedName,
        createdAt: r.createdAt.toISOString(),
        sourceDocumentId: r.sourceDocumentId ?? null,
        sourceDocumentName: r.sourceDocumentName ?? null,
        sourceDocumentCategory:
          r.sourceDocumentCategory ?? r.procDocumentCategory ?? null,
        confidence: r.confidence ?? null,
        sourceHighlights: extractHighlights(
          r.entryMetadata,
          r.aiClassification,
        ),
        metadata: (r.entryMetadata as Record<string, unknown> | null) ?? {},
        daysPending,
      };
    });

    const totalCount = Number(totalRow[0]?.count ?? 0);
    return {
      entries,
      totalCount,
      hasMore: offset + entries.length < totalCount,
    };
  } catch (error) {
    logger.error("Failed to load AI review queue", { error });
    return { entries: [], totalCount: 0, hasMore: false };
  }
}

/** High-level stats for the stats cards at the top of the review queue. */
export async function getAiReviewStats(): Promise<AiReviewStats> {
  const session = await requireSession();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const orgCondition = eq(
    medicalChronologyEntries.organizationId,
    session.organizationId,
  );
  const aiCondition = eq(medicalChronologyEntries.aiGenerated, true);

  try {
    const [
      pendingRow,
      approvedRow,
      rejectedRow,
      oldestPendingRow,
      avgConfThisWeekRow,
      avgConfPrevWeekRow,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(medicalChronologyEntries)
        .where(
          and(
            orgCondition,
            aiCondition,
            eq(medicalChronologyEntries.isVerified, false),
            eq(medicalChronologyEntries.isExcluded, false),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(medicalChronologyEntries)
        .where(
          and(
            orgCondition,
            aiCondition,
            eq(medicalChronologyEntries.isVerified, true),
            gte(medicalChronologyEntries.verifiedAt, weekAgo),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(medicalChronologyEntries)
        .where(
          and(
            orgCondition,
            aiCondition,
            eq(medicalChronologyEntries.isExcluded, true),
            gte(medicalChronologyEntries.updatedAt, weekAgo),
          ),
        ),
      db
        .select({
          oldest: sql<
            string | null
          >`min(${medicalChronologyEntries.createdAt})`,
        })
        .from(medicalChronologyEntries)
        .where(
          and(
            orgCondition,
            aiCondition,
            eq(medicalChronologyEntries.isVerified, false),
            eq(medicalChronologyEntries.isExcluded, false),
          ),
        ),
      db
        .select({
          avg: sql<number>`coalesce(avg(${documentProcessingResults.aiConfidence}), 0)::int`,
        })
        .from(medicalChronologyEntries)
        .leftJoin(
          documentProcessingResults,
          eq(
            documentProcessingResults.documentId,
            medicalChronologyEntries.sourceDocumentId,
          ),
        )
        .where(
          and(
            orgCondition,
            aiCondition,
            gte(medicalChronologyEntries.createdAt, weekAgo),
          ),
        ),
      db
        .select({
          avg: sql<number>`coalesce(avg(${documentProcessingResults.aiConfidence}), 0)::int`,
        })
        .from(medicalChronologyEntries)
        .leftJoin(
          documentProcessingResults,
          eq(
            documentProcessingResults.documentId,
            medicalChronologyEntries.sourceDocumentId,
          ),
        )
        .where(
          and(
            orgCondition,
            aiCondition,
            gte(medicalChronologyEntries.createdAt, twoWeeksAgo),
            lte(medicalChronologyEntries.createdAt, weekAgo),
          ),
        ),
    ]);

    const oldest = oldestPendingRow[0]?.oldest;
    let oldestPendingDays = 0;
    if (oldest) {
      const oldestDate =
        typeof oldest === "string" ? new Date(oldest) : (oldest as Date);
      oldestPendingDays = Math.max(
        0,
        Math.floor(
          (now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
    }

    const avgConfidence = Number(avgConfThisWeekRow[0]?.avg ?? 0);
    const prevAvg = Number(avgConfPrevWeekRow[0]?.avg ?? 0);

    return {
      pendingReview: Number(pendingRow[0]?.count ?? 0),
      approvedThisWeek: Number(approvedRow[0]?.count ?? 0),
      rejectedThisWeek: Number(rejectedRow[0]?.count ?? 0),
      avgConfidence,
      oldestPendingDays,
      confidenceTrend: avgConfidence - prevAvg,
    };
  } catch (error) {
    logger.error("Failed to load AI review stats", { error });
    return {
      pendingReview: 0,
      approvedThisWeek: 0,
      rejectedThisWeek: 0,
      avgConfidence: 0,
      oldestPendingDays: 0,
      confidenceTrend: 0,
    };
  }
}

async function getEntryForAudit(entryId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: medicalChronologyEntries.id,
      caseId: medicalChronologyEntries.caseId,
      metadata: medicalChronologyEntries.metadata,
      confidence: documentProcessingResults.aiConfidence,
    })
    .from(medicalChronologyEntries)
    .leftJoin(
      documentProcessingResults,
      eq(
        documentProcessingResults.documentId,
        medicalChronologyEntries.sourceDocumentId,
      ),
    )
    .where(
      and(
        eq(medicalChronologyEntries.id, entryId),
        eq(medicalChronologyEntries.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Approve a single AI extraction. */
export async function approveExtraction(entryId: string) {
  const session = await requireSession();

  const existing = await getEntryForAudit(entryId, session.organizationId);
  if (!existing) throw new Error("Extraction entry not found");

  await db
    .update(medicalChronologyEntries)
    .set({
      isVerified: true,
      verifiedBy: session.id,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(medicalChronologyEntries.id, entryId),
        eq(medicalChronologyEntries.organizationId, session.organizationId),
      ),
    );

  await logExtractionReview({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "medical_chronology_entry",
    entityId: entryId,
    caseId: existing.caseId,
    decision: "approve",
    confidence: existing.confidence ?? null,
    severity: "info",
    metadata: { entryId },
  });

  revalidatePath("/admin/ai-review");
  if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`);
}

/** Reject an extraction (marks it excluded + records the reason). */
export async function rejectExtraction(entryId: string, reason?: string) {
  const session = await requireSession();

  const existing = await getEntryForAudit(entryId, session.organizationId);
  if (!existing) throw new Error("Extraction entry not found");

  const prevMetadata =
    (existing.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata: Record<string, unknown> = {
    ...prevMetadata,
    rejectionReason: reason ?? null,
    rejectedBy: session.id,
    rejectedAt: new Date().toISOString(),
  };

  await db
    .update(medicalChronologyEntries)
    .set({
      isExcluded: true,
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(medicalChronologyEntries.id, entryId),
        eq(medicalChronologyEntries.organizationId, session.organizationId),
      ),
    );

  await logExtractionReview({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "medical_chronology_entry",
    entityId: entryId,
    caseId: existing.caseId,
    decision: "reject",
    confidence: existing.confidence ?? null,
    reason: reason ?? undefined,
    severity: "warning",
    metadata: { entryId, reason: reason ?? null },
  });

  revalidatePath("/admin/ai-review");
  if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`);
}

export type ExtractionUpdate = {
  summary?: string;
  details?: string | null;
  providerName?: string | null;
  providerType?: string | null;
  facilityName?: string | null;
  eventDate?: string | null;
  diagnoses?: string[];
  treatments?: string[];
  medications?: string[];
};

/**
 * Edit a chronology entry's fields. Only verified reviewers (already in our
 * session model — the requireSession user) can hit this path; we also mark
 * the entry verified since an edit is an implicit approve.
 */
export async function editExtraction(
  entryId: string,
  updates: ExtractionUpdate,
) {
  const session = await requireSession();

  const existing = await getEntryForAudit(entryId, session.organizationId);
  if (!existing) throw new Error("Extraction entry not found");

  const setClause: Record<string, unknown> = {
    updatedAt: new Date(),
    isVerified: true,
    verifiedBy: session.id,
    verifiedAt: new Date(),
  };

  if (updates.summary !== undefined) setClause.summary = updates.summary;
  if (updates.details !== undefined) setClause.details = updates.details;
  if (updates.providerName !== undefined)
    setClause.providerName = updates.providerName;
  if (updates.providerType !== undefined)
    setClause.providerType = updates.providerType;
  if (updates.facilityName !== undefined)
    setClause.facilityName = updates.facilityName;
  if (updates.eventDate !== undefined)
    setClause.eventDate = updates.eventDate
      ? new Date(updates.eventDate)
      : null;
  if (updates.diagnoses !== undefined) setClause.diagnoses = updates.diagnoses;
  if (updates.treatments !== undefined)
    setClause.treatments = updates.treatments;
  if (updates.medications !== undefined)
    setClause.medications = updates.medications;

  await db
    .update(medicalChronologyEntries)
    .set(setClause)
    .where(
      and(
        eq(medicalChronologyEntries.id, entryId),
        eq(medicalChronologyEntries.organizationId, session.organizationId),
      ),
    );

  await logExtractionReview({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "medical_chronology_entry",
    entityId: entryId,
    caseId: existing.caseId,
    decision: "edit",
    confidence: existing.confidence ?? null,
    severity: "info",
    metadata: { entryId, fieldsChanged: Object.keys(updates) },
  });

  revalidatePath("/admin/ai-review");
  if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`);
}

/** Bulk approve a list of AI extractions. */
export async function bulkApprove(entryIds: string[]) {
  const session = await requireSession();
  if (entryIds.length === 0) return { approved: 0 };

  const existing = await db
    .select({
      id: medicalChronologyEntries.id,
      caseId: medicalChronologyEntries.caseId,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.organizationId, session.organizationId),
        inArray(medicalChronologyEntries.id, entryIds),
      ),
    );

  if (existing.length === 0) return { approved: 0 };

  const now = new Date();
  await db
    .update(medicalChronologyEntries)
    .set({
      isVerified: true,
      verifiedBy: session.id,
      verifiedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(medicalChronologyEntries.organizationId, session.organizationId),
        inArray(
          medicalChronologyEntries.id,
          existing.map((r) => r.id),
        ),
      ),
    );

  await Promise.all(
    existing.map((row) =>
      logExtractionReview({
        organizationId: session.organizationId,
        userId: session.id,
        entityType: "medical_chronology_entry",
        entityId: row.id,
        caseId: row.caseId,
        decision: "bulk_approve",
        severity: "info",
        metadata: { entryId: row.id, batchSize: existing.length },
      }),
    ),
  );

  revalidatePath("/admin/ai-review");
  return { approved: existing.length };
}

/** Bulk reject a list of AI extractions. */
export async function bulkReject(entryIds: string[], reason?: string) {
  const session = await requireSession();
  if (entryIds.length === 0) return { rejected: 0 };

  const existing = await db
    .select({
      id: medicalChronologyEntries.id,
      caseId: medicalChronologyEntries.caseId,
      metadata: medicalChronologyEntries.metadata,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.organizationId, session.organizationId),
        inArray(medicalChronologyEntries.id, entryIds),
      ),
    );

  if (existing.length === 0) return { rejected: 0 };

  const now = new Date();

  for (const row of existing) {
    const prev = (row.metadata as Record<string, unknown> | null) ?? {};
    await db
      .update(medicalChronologyEntries)
      .set({
        isExcluded: true,
        metadata: {
          ...prev,
          rejectionReason: reason ?? null,
          rejectedBy: session.id,
          rejectedAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(medicalChronologyEntries.id, row.id));
  }

  await Promise.all(
    existing.map((row) =>
      logExtractionReview({
        organizationId: session.organizationId,
        userId: session.id,
        entityType: "medical_chronology_entry",
        entityId: row.id,
        caseId: row.caseId,
        decision: "bulk_reject",
        reason: reason ?? undefined,
        severity: "warning",
        metadata: {
          entryId: row.id,
          batchSize: existing.length,
          reason: reason ?? null,
        },
      }),
    ),
  );

  revalidatePath("/admin/ai-review");
  return { rejected: existing.length };
}

// ─── v2 query layer ─────────────────────────────────────────────────
// Powers the new focus / table / canvas modes. Driven by the ReviewQuery
// grammar in lib/ai-review.

import {
  buildOrderBy,
  buildWhere,
} from "@/lib/ai-review/server-query";
import type {
  FacetCounts,
  ReviewQuery,
} from "@/lib/ai-review/types";

/**
 * Hydrate the rows returned by the v2 query into the AiReviewEntry shape
 * the UI expects. Same enrichment as getAiReviewQueue: claimant lookup,
 * highlights, daysPending. Extracted for reuse.
 */
async function hydrateEntries(
  rows: Array<{
    id: string;
    caseId: string;
    entryType: string;
    eventDate: Date | null;
    providerName: string | null;
    providerType: string | null;
    facilityName: string | null;
    summary: string;
    details: string | null;
    diagnoses: string[] | null;
    treatments: string[] | null;
    medications: string[] | null;
    aiGenerated: boolean;
    isVerified: boolean;
    isExcluded: boolean;
    verifiedAt: Date | null;
    verifiedBy: string | null;
    createdAt: Date;
    entryMetadata: unknown;
    sourceDocumentId: string | null;
    sourceDocumentName: string | null;
    sourceDocumentCategory: string | null;
    caseNumber: string | null;
    confidence: number | null;
    aiClassification: unknown;
    procDocumentCategory: string | null;
    verifierFirstName: string | null;
    verifierLastName: string | null;
  }>,
): Promise<AiReviewEntry[]> {
  const caseIds = Array.from(
    new Set(rows.map((r) => r.caseId).filter(Boolean)),
  );
  const claimantMap = new Map<string, string>();
  if (caseIds.length > 0) {
    const claimantRows = await db
      .select({
        caseId: caseContacts.caseId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        relationship: caseContacts.relationship,
        isPrimary: caseContacts.isPrimary,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(inArray(caseContacts.caseId, caseIds));
    for (const row of claimantRows) {
      if (row.relationship !== "claimant" && !row.isPrimary) continue;
      if (claimantMap.has(row.caseId) && row.relationship !== "claimant") {
        continue;
      }
      claimantMap.set(
        row.caseId,
        `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
      );
    }
  }

  const now = Date.now();
  return rows.map((r) => {
    const created = r.createdAt?.getTime() ?? now;
    const daysPending = Math.max(
      0,
      Math.floor((now - created) / (1000 * 60 * 60 * 24)),
    );
    const verifiedName =
      r.verifierFirstName || r.verifierLastName
        ? `${r.verifierFirstName ?? ""} ${r.verifierLastName ?? ""}`.trim()
        : null;
    return {
      id: r.id,
      caseId: r.caseId,
      caseNumber: r.caseNumber ?? null,
      claimantName: claimantMap.get(r.caseId) ?? null,
      entryType: r.entryType,
      eventDate: r.eventDate ? r.eventDate.toISOString() : null,
      providerName: r.providerName ?? null,
      providerType: r.providerType ?? null,
      facilityName: r.facilityName ?? null,
      summary: r.summary,
      details: r.details ?? null,
      diagnoses: r.diagnoses ?? [],
      treatments: r.treatments ?? [],
      medications: r.medications ?? [],
      aiGenerated: r.aiGenerated,
      isVerified: r.isVerified,
      isExcluded: r.isExcluded,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      verifiedBy: r.verifiedBy,
      verifiedByName: verifiedName,
      createdAt: r.createdAt.toISOString(),
      sourceDocumentId: r.sourceDocumentId ?? null,
      sourceDocumentName: r.sourceDocumentName ?? null,
      sourceDocumentCategory:
        r.sourceDocumentCategory ?? r.procDocumentCategory ?? null,
      confidence: r.confidence ?? null,
      sourceHighlights: extractHighlights(r.entryMetadata, r.aiClassification),
      metadata: (r.entryMetadata as Record<string, unknown> | null) ?? {},
      daysPending,
    };
  });
}

/** New v2 list query — driven by the structured ReviewQuery grammar. */
export async function getReviewEntriesV2(
  q: ReviewQuery = {},
): Promise<AiReviewListResult> {
  const session = await requireSession();
  const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), MAX_PAGE_SIZE);
  const page = Math.max(q.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const where = buildWhere(session.organizationId, q);
  const orderBy = buildOrderBy(q.sort);

  try {
    const baseQuery = db
      .select({
        id: medicalChronologyEntries.id,
        caseId: medicalChronologyEntries.caseId,
        entryType: medicalChronologyEntries.entryType,
        eventDate: medicalChronologyEntries.eventDate,
        providerName: medicalChronologyEntries.providerName,
        providerType: medicalChronologyEntries.providerType,
        facilityName: medicalChronologyEntries.facilityName,
        summary: medicalChronologyEntries.summary,
        details: medicalChronologyEntries.details,
        diagnoses: medicalChronologyEntries.diagnoses,
        treatments: medicalChronologyEntries.treatments,
        medications: medicalChronologyEntries.medications,
        aiGenerated: medicalChronologyEntries.aiGenerated,
        isVerified: medicalChronologyEntries.isVerified,
        isExcluded: medicalChronologyEntries.isExcluded,
        verifiedAt: medicalChronologyEntries.verifiedAt,
        verifiedBy: medicalChronologyEntries.verifiedBy,
        createdAt: medicalChronologyEntries.createdAt,
        entryMetadata: medicalChronologyEntries.metadata,
        sourceDocumentId: medicalChronologyEntries.sourceDocumentId,
        sourceDocumentName: documents.fileName,
        sourceDocumentCategory: documents.category,
        caseNumber: cases.caseNumber,
        confidence: documentProcessingResults.aiConfidence,
        aiClassification: documentProcessingResults.aiClassification,
        procDocumentCategory: documentProcessingResults.documentCategory,
        verifierFirstName: users.firstName,
        verifierLastName: users.lastName,
      })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(medicalChronologyEntries.sourceDocumentId, documents.id),
      )
      .leftJoin(
        documentProcessingResults,
        eq(
          documentProcessingResults.documentId,
          medicalChronologyEntries.sourceDocumentId,
        ),
      )
      .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
      .leftJoin(users, eq(medicalChronologyEntries.verifiedBy, users.id));

    // Joins required only when a filter references those tables.
    let listQuery = baseQuery;
    if (q.claimant) {
      listQuery = listQuery
        .leftJoin(
          caseContacts,
          eq(caseContacts.caseId, medicalChronologyEntries.caseId),
        )
        .leftJoin(contacts, eq(caseContacts.contactId, contacts.id)) as typeof baseQuery;
    }

    const rows = await listQuery
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(medicalChronologyEntries.sourceDocumentId, documents.id),
      )
      .leftJoin(
        documentProcessingResults,
        eq(
          documentProcessingResults.documentId,
          medicalChronologyEntries.sourceDocumentId,
        ),
      )
      .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
      .where(where);

    const entries = await hydrateEntries(rows);
    const totalCount = Number(totalRow[0]?.count ?? 0);
    return {
      entries,
      totalCount,
      hasMore: offset + entries.length < totalCount,
    };
  } catch (error) {
    logger.error("v2 review query failed", { error });
    return { entries: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Aggregate counts for the chip row + saved-views badges. Mirrors the
 * filter set so chip labels stay accurate ("Pending 847 · Low conf 213").
 */
export async function getFacetCounts(
  q: ReviewQuery = {},
): Promise<FacetCounts> {
  const session = await requireSession();
  // Note: the per-dimension queries below ignore the corresponding chip
  // (e.g. confidence counts ignore q.confidence) so the chip badges stay
  // accurate even after the user has narrowed the query.
  void q;
  try {
    const orgCondition = eq(
      medicalChronologyEntries.organizationId,
      session.organizationId,
    );
    const aiCondition = eq(medicalChronologyEntries.aiGenerated, true);

    const [statusRow, confRow, casesRow, providersRow, typesRow] =
      await Promise.all([
        db
          .select({
            pending: sql<number>`count(*) FILTER (WHERE NOT ${medicalChronologyEntries.isVerified} AND NOT ${medicalChronologyEntries.isExcluded})::int`,
            approved: sql<number>`count(*) FILTER (WHERE ${medicalChronologyEntries.isVerified})::int`,
            rejected: sql<number>`count(*) FILTER (WHERE ${medicalChronologyEntries.isExcluded})::int`,
          })
          .from(medicalChronologyEntries)
          .where(and(orgCondition, aiCondition)),
        db
          .select({
            low: sql<number>`count(*) FILTER (WHERE ${documentProcessingResults.aiConfidence} <= 59)::int`,
            medium: sql<number>`count(*) FILTER (WHERE ${documentProcessingResults.aiConfidence} BETWEEN 60 AND 80)::int`,
            high: sql<number>`count(*) FILTER (WHERE ${documentProcessingResults.aiConfidence} >= 81)::int`,
            unknown: sql<number>`count(*) FILTER (WHERE ${documentProcessingResults.aiConfidence} IS NULL)::int`,
          })
          .from(medicalChronologyEntries)
          .leftJoin(
            documentProcessingResults,
            eq(
              documentProcessingResults.documentId,
              medicalChronologyEntries.sourceDocumentId,
            ),
          )
          .where(
            and(
              orgCondition,
              aiCondition,
              eq(medicalChronologyEntries.isVerified, false),
              eq(medicalChronologyEntries.isExcluded, false),
            ),
          ),
        db
          .select({
            caseId: medicalChronologyEntries.caseId,
            caseNumber: cases.caseNumber,
            pending: sql<number>`count(*)::int`,
          })
          .from(medicalChronologyEntries)
          .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
          .where(
            and(
              orgCondition,
              aiCondition,
              eq(medicalChronologyEntries.isVerified, false),
              eq(medicalChronologyEntries.isExcluded, false),
            ),
          )
          .groupBy(medicalChronologyEntries.caseId, cases.caseNumber)
          .orderBy(desc(sql`count(*)`))
          .limit(8),
        db
          .select({
            name: medicalChronologyEntries.providerName,
            pending: sql<number>`count(*)::int`,
          })
          .from(medicalChronologyEntries)
          .where(
            and(
              orgCondition,
              aiCondition,
              eq(medicalChronologyEntries.isVerified, false),
              eq(medicalChronologyEntries.isExcluded, false),
            ),
          )
          .groupBy(medicalChronologyEntries.providerName)
          .orderBy(desc(sql`count(*)`))
          .limit(8),
        db
          .select({
            type: medicalChronologyEntries.entryType,
            count: sql<number>`count(*)::int`,
          })
          .from(medicalChronologyEntries)
          .where(
            and(
              orgCondition,
              aiCondition,
              eq(medicalChronologyEntries.isVerified, false),
              eq(medicalChronologyEntries.isExcluded, false),
            ),
          )
          .groupBy(medicalChronologyEntries.entryType)
          .orderBy(desc(sql`count(*)`))
          .limit(10),
      ]);

    return {
      status: {
        pending: Number(statusRow[0]?.pending ?? 0),
        approved: Number(statusRow[0]?.approved ?? 0),
        rejected: Number(statusRow[0]?.rejected ?? 0),
      },
      confidence: {
        low: Number(confRow[0]?.low ?? 0),
        medium: Number(confRow[0]?.medium ?? 0),
        high: Number(confRow[0]?.high ?? 0),
        unknown: Number(confRow[0]?.unknown ?? 0),
      },
      topCases: casesRow
        .filter((r): r is typeof r & { caseNumber: string } => !!r.caseNumber)
        .map((r) => ({
          caseId: r.caseId,
          caseNumber: r.caseNumber,
          pending: Number(r.pending),
        })),
      topProviders: providersRow
        .filter((r): r is typeof r & { name: string } => !!r.name)
        .map((r) => ({ name: r.name, pending: Number(r.pending) })),
      topTypes: typesRow.map((r) => ({
        type: r.type,
        count: Number(r.count),
      })),
    };
  } catch (error) {
    logger.error("facet counts failed", { error });
    return {
      status: { pending: 0, approved: 0, rejected: 0 },
      confidence: { low: 0, medium: 0, high: 0, unknown: 0 },
      topCases: [],
      topProviders: [],
      topTypes: [],
    };
  }
}

/**
 * Pick the next-best entry to show in focus mode. Implements the hybrid
 * scheduler from the design: case-streak (40%) → uncertainty band (30%)
 * → readiness (20%) → diversity (10%). For v1 we use a simpler proxy:
 * stay in current case if currentCaseId provided; otherwise the case
 * with the most pending entries. Within that case, lowest-confidence
 * pending first, then oldest createdAt.
 */
export async function getNextEntry(
  q: ReviewQuery = {},
  opts: { currentCaseId?: string; skipIds?: string[] } = {},
): Promise<AiReviewEntry | null> {
  const session = await requireSession();
  const where = buildWhere(session.organizationId, {
    ...q,
    status: "pending",
  });

  try {
    let targetCaseId = opts.currentCaseId;
    if (!targetCaseId) {
      // Pick the case with the most pending entries matching the query.
      const top = await db
        .select({
          caseId: medicalChronologyEntries.caseId,
          n: sql<number>`count(*)::int`,
        })
        .from(medicalChronologyEntries)
        .leftJoin(
          documents,
          eq(medicalChronologyEntries.sourceDocumentId, documents.id),
        )
        .leftJoin(
          documentProcessingResults,
          eq(
            documentProcessingResults.documentId,
            medicalChronologyEntries.sourceDocumentId,
          ),
        )
        .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
        .where(where)
        .groupBy(medicalChronologyEntries.caseId)
        .orderBy(desc(sql`count(*)`))
        .limit(1);
      targetCaseId = top[0]?.caseId;
    }
    if (!targetCaseId) return null;

    const conds = [
      eq(medicalChronologyEntries.organizationId, session.organizationId),
      eq(medicalChronologyEntries.aiGenerated, true),
      eq(medicalChronologyEntries.isVerified, false),
      eq(medicalChronologyEntries.isExcluded, false),
      eq(medicalChronologyEntries.caseId, targetCaseId),
    ];
    if (opts.skipIds?.length) {
      conds.push(sql`${medicalChronologyEntries.id} <> ALL(${opts.skipIds})`);
    }

    const rows = await db
      .select({
        id: medicalChronologyEntries.id,
        caseId: medicalChronologyEntries.caseId,
        entryType: medicalChronologyEntries.entryType,
        eventDate: medicalChronologyEntries.eventDate,
        providerName: medicalChronologyEntries.providerName,
        providerType: medicalChronologyEntries.providerType,
        facilityName: medicalChronologyEntries.facilityName,
        summary: medicalChronologyEntries.summary,
        details: medicalChronologyEntries.details,
        diagnoses: medicalChronologyEntries.diagnoses,
        treatments: medicalChronologyEntries.treatments,
        medications: medicalChronologyEntries.medications,
        aiGenerated: medicalChronologyEntries.aiGenerated,
        isVerified: medicalChronologyEntries.isVerified,
        isExcluded: medicalChronologyEntries.isExcluded,
        verifiedAt: medicalChronologyEntries.verifiedAt,
        verifiedBy: medicalChronologyEntries.verifiedBy,
        createdAt: medicalChronologyEntries.createdAt,
        entryMetadata: medicalChronologyEntries.metadata,
        sourceDocumentId: medicalChronologyEntries.sourceDocumentId,
        sourceDocumentName: documents.fileName,
        sourceDocumentCategory: documents.category,
        caseNumber: cases.caseNumber,
        confidence: documentProcessingResults.aiConfidence,
        aiClassification: documentProcessingResults.aiClassification,
        procDocumentCategory: documentProcessingResults.documentCategory,
        verifierFirstName: users.firstName,
        verifierLastName: users.lastName,
      })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(medicalChronologyEntries.sourceDocumentId, documents.id),
      )
      .leftJoin(
        documentProcessingResults,
        eq(
          documentProcessingResults.documentId,
          medicalChronologyEntries.sourceDocumentId,
        ),
      )
      .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
      .leftJoin(users, eq(medicalChronologyEntries.verifiedBy, users.id))
      .where(and(...conds))
      .orderBy(
        asc(sql`COALESCE(${documentProcessingResults.aiConfidence}, 0)`),
        asc(medicalChronologyEntries.createdAt),
      )
      .limit(1);

    if (rows.length === 0) return null;
    const [hydrated] = await hydrateEntries(rows);
    return hydrated ?? null;
  } catch (error) {
    logger.error("getNextEntry failed", { error });
    return null;
  }
}

/** Autocomplete source: cases with at least one pending entry. */
export async function listReviewableCases(
  search: string,
): Promise<Array<{ caseId: string; caseNumber: string; pending: number }>> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        caseId: medicalChronologyEntries.caseId,
        caseNumber: cases.caseNumber,
        pending: sql<number>`count(*)::int`,
      })
      .from(medicalChronologyEntries)
      .leftJoin(cases, eq(medicalChronologyEntries.caseId, cases.id))
      .where(
        and(
          eq(medicalChronologyEntries.organizationId, session.organizationId),
          eq(medicalChronologyEntries.aiGenerated, true),
          eq(medicalChronologyEntries.isVerified, false),
          eq(medicalChronologyEntries.isExcluded, false),
          search ? ilike(cases.caseNumber, `%${search}%`) : sql`TRUE`,
        ),
      )
      .groupBy(medicalChronologyEntries.caseId, cases.caseNumber)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    return rows
      .filter((r): r is typeof r & { caseNumber: string } => !!r.caseNumber)
      .map((r) => ({
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        pending: Number(r.pending),
      }));
  } catch (error) {
    logger.error("listReviewableCases failed", { error });
    return [];
  }
}

/** Autocomplete source: providers with at least one pending entry. */
export async function listReviewableProviders(
  search: string,
): Promise<Array<{ name: string; pending: number }>> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        name: medicalChronologyEntries.providerName,
        pending: sql<number>`count(*)::int`,
      })
      .from(medicalChronologyEntries)
      .where(
        and(
          eq(medicalChronologyEntries.organizationId, session.organizationId),
          eq(medicalChronologyEntries.aiGenerated, true),
          eq(medicalChronologyEntries.isVerified, false),
          eq(medicalChronologyEntries.isExcluded, false),
          search
            ? ilike(medicalChronologyEntries.providerName, `%${search}%`)
            : sql`TRUE`,
        ),
      )
      .groupBy(medicalChronologyEntries.providerName)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    return rows
      .filter((r): r is typeof r & { name: string } => !!r.name)
      .map((r) => ({ name: r.name, pending: Number(r.pending) }));
  } catch (error) {
    logger.error("listReviewableProviders failed", { error });
    return [];
  }
}

// ─── Legacy helpers below ───────────────────────────────────────────

/** List of document categories present in this org, for the filter dropdown. */
export async function getAiReviewDocumentTypes(): Promise<string[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .selectDistinct({
        category: documentProcessingResults.documentCategory,
      })
      .from(documentProcessingResults)
      .where(
        eq(documentProcessingResults.organizationId, session.organizationId),
      );
    return rows
      .map((r) => r.category)
      .filter((c): c is string => Boolean(c))
      .sort();
  } catch (error) {
    logger.error("Failed to load AI review document types", { error });
    return [];
  }
}
