"use server";

import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/drizzle";
import {
  auditLog,
  caseStageTransitions,
  caseStages,
  caseStageGroups,
  cases,
  contacts,
  caseContacts,
  hearingOutcomes,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HearingOutcomeValue =
  | "fully_favorable"
  | "partially_favorable"
  | "unfavorable"
  | "dismissed"
  | "remanded";

const VALID_OUTCOMES: HearingOutcomeValue[] = [
  "fully_favorable",
  "partially_favorable",
  "unfavorable",
  "dismissed",
  "remanded",
];

const AI_CONFIDENCE_THRESHOLD = 60;

export type PendingOutcomeRow = {
  id: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  outcome: string;
  status: string;
  aiConfidence: number | null;
  aiOutcome: string | null;
  hearingDate: string | null;
  notes: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidOutcome(outcome: string): asserts outcome is HearingOutcomeValue {
  if (!VALID_OUTCOMES.includes(outcome as HearingOutcomeValue)) {
    throw new Error(
      `Invalid outcome "${outcome}". Must be one of: ${VALID_OUTCOMES.join(", ")}`,
    );
  }
}

async function fetchClaimantNames(caseIds: string[]) {
  if (caseIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({
      caseId: caseContacts.caseId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(caseContacts)
    .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(
      and(
        inArray(caseContacts.caseId, caseIds),
        eq(caseContacts.relationship, "claimant"),
        eq(caseContacts.isPrimary, true),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(
      r.caseId,
      [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
    );
  }
  return map;
}

/**
 * Find the next stage after the hearing-decision stage for a given case. If
 * the case isn't in a hearing-ish stage or there's no clearly defined "next"
 * stage, returns null and we skip the transition. This is intentionally
 * conservative — we'd rather leave the stage alone than advance to the wrong
 * place and confuse downstream assignments.
 */
async function findPostHearingNextStageId(
  organizationId: string,
  currentStageId: string,
) {
  const [currentStage] = await db
    .select({
      id: caseStages.id,
      displayOrder: caseStages.displayOrder,
      allowedNextStageIds: caseStages.allowedNextStageIds,
      stageGroupId: caseStages.stageGroupId,
    })
    .from(caseStages)
    .where(eq(caseStages.id, currentStageId));

  if (!currentStage) return null;

  if (
    currentStage.allowedNextStageIds &&
    currentStage.allowedNextStageIds.length > 0
  ) {
    return currentStage.allowedNextStageIds[0];
  }

  const allStages = await db
    .select({
      id: caseStages.id,
      displayOrder: caseStages.displayOrder,
      groupDisplayOrder: caseStageGroups.displayOrder,
    })
    .from(caseStages)
    .innerJoin(
      caseStageGroups,
      eq(caseStages.stageGroupId, caseStageGroups.id),
    )
    .where(
      and(
        eq(caseStages.organizationId, organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .orderBy(asc(caseStageGroups.displayOrder), asc(caseStages.displayOrder));

  const idx = allStages.findIndex((s) => s.id === currentStageId);
  if (idx >= 0 && idx < allStages.length - 1) {
    return allStages[idx + 1].id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Oldest unprocessed hearing outcome notification — the "next up to approve".
 */
export async function getOldestPendingOutcome(): Promise<PendingOutcomeRow | null> {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: hearingOutcomes.id,
      caseId: hearingOutcomes.caseId,
      caseNumber: cases.caseNumber,
      outcome: hearingOutcomes.outcome,
      status: hearingOutcomes.status,
      aiConfidence: hearingOutcomes.aiConfidence,
      aiOutcome: hearingOutcomes.aiOutcome,
      hearingDate: hearingOutcomes.hearingDate,
      notes: hearingOutcomes.notes,
      createdAt: hearingOutcomes.createdAt,
    })
    .from(hearingOutcomes)
    .innerJoin(cases, eq(hearingOutcomes.caseId, cases.id))
    .where(
      and(
        eq(hearingOutcomes.organizationId, session.organizationId),
        eq(hearingOutcomes.status, "pending_review"),
      ),
    )
    .orderBy(asc(hearingOutcomes.createdAt))
    .limit(1);

  if (!row) return null;

  const names = await fetchClaimantNames([row.caseId]);
  return {
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.caseNumber,
    claimantName: names.get(row.caseId) ?? "",
    outcome: row.outcome,
    status: row.status,
    aiConfidence: row.aiConfidence,
    aiOutcome: row.aiOutcome,
    hearingDate: row.hearingDate ? row.hearingDate.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Oldest in-flight outcome (approved but not yet complete) — the "next up to
 * mark complete".
 */
export async function getOldestInFlightOutcome(): Promise<PendingOutcomeRow | null> {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: hearingOutcomes.id,
      caseId: hearingOutcomes.caseId,
      caseNumber: cases.caseNumber,
      outcome: hearingOutcomes.outcome,
      status: hearingOutcomes.status,
      aiConfidence: hearingOutcomes.aiConfidence,
      aiOutcome: hearingOutcomes.aiOutcome,
      hearingDate: hearingOutcomes.hearingDate,
      notes: hearingOutcomes.notes,
      createdAt: hearingOutcomes.createdAt,
    })
    .from(hearingOutcomes)
    .innerJoin(cases, eq(hearingOutcomes.caseId, cases.id))
    .where(
      and(
        eq(hearingOutcomes.organizationId, session.organizationId),
        eq(hearingOutcomes.status, "approved_for_processing"),
      ),
    )
    .orderBy(asc(hearingOutcomes.approvedAt))
    .limit(1);

  if (!row) return null;

  const names = await fetchClaimantNames([row.caseId]);
  return {
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.caseNumber,
    claimantName: names.get(row.caseId) ?? "",
    outcome: row.outcome,
    status: row.status,
    aiConfidence: row.aiConfidence,
    aiOutcome: row.aiOutcome,
    hearingDate: row.hearingDate ? row.hearingDate.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recent anomalies where AI confidence is below the review threshold.
 */
export async function getAiAnomalies(
  limit = 20,
): Promise<PendingOutcomeRow[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: hearingOutcomes.id,
      caseId: hearingOutcomes.caseId,
      caseNumber: cases.caseNumber,
      outcome: hearingOutcomes.outcome,
      status: hearingOutcomes.status,
      aiConfidence: hearingOutcomes.aiConfidence,
      aiOutcome: hearingOutcomes.aiOutcome,
      hearingDate: hearingOutcomes.hearingDate,
      notes: hearingOutcomes.notes,
      createdAt: hearingOutcomes.createdAt,
    })
    .from(hearingOutcomes)
    .innerJoin(cases, eq(hearingOutcomes.caseId, cases.id))
    .where(
      and(
        eq(hearingOutcomes.organizationId, session.organizationId),
        lt(hearingOutcomes.aiConfidence, AI_CONFIDENCE_THRESHOLD),
      ),
    )
    .orderBy(desc(hearingOutcomes.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const names = await fetchClaimantNames(rows.map((r) => r.caseId));
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    claimantName: names.get(r.caseId) ?? "",
    outcome: r.outcome,
    status: r.status,
    aiConfidence: r.aiConfidence,
    aiOutcome: r.aiOutcome,
    hearingDate: r.hearingDate ? r.hearingDate.toISOString() : null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Approve a hearing outcome notification for downstream processing. Advances
 * the case stage when we can identify a clear next stage.
 */
export async function approveHearingOutcome(outcomeId: string) {
  const session = await requireSession();

  const result = await db.transaction(async (tx) => {
    const [outcome] = await tx
      .select({
        id: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        status: hearingOutcomes.status,
        outcome: hearingOutcomes.outcome,
      })
      .from(hearingOutcomes)
      .where(
        and(
          eq(hearingOutcomes.id, outcomeId),
          eq(hearingOutcomes.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    if (!outcome) throw new Error("Hearing outcome not found");
    if (outcome.status !== "pending_review") {
      throw new Error(
        `Outcome cannot be approved — current status is "${outcome.status}".`,
      );
    }

    const now = new Date();

    await tx
      .update(hearingOutcomes)
      .set({
        status: "approved_for_processing",
        approvedAt: now,
        approvedBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    // Try to advance the case stage if we can.
    const [caseRow] = await tx
      .select({
        id: cases.id,
        currentStageId: cases.currentStageId,
      })
      .from(cases)
      .where(
        and(
          eq(cases.id, outcome.caseId),
          eq(cases.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    let transitionedToStageId: string | null = null;
    if (caseRow) {
      const nextStageId = await findPostHearingNextStageId(
        session.organizationId,
        caseRow.currentStageId,
      );
      if (nextStageId && nextStageId !== caseRow.currentStageId) {
        await tx
          .update(cases)
          .set({
            currentStageId: nextStageId,
            stageEnteredAt: now,
            updatedAt: now,
            updatedBy: session.id,
          })
          .where(eq(cases.id, caseRow.id));

        await tx.insert(caseStageTransitions).values({
          caseId: caseRow.id,
          fromStageId: caseRow.currentStageId,
          toStageId: nextStageId,
          transitionedBy: session.id,
          notes: `Auto-advanced after hearing outcome approval (${outcome.outcome})`,
          isAutomatic: true,
        });
        transitionedToStageId = nextStageId;
      }
    }

    await tx.insert(auditLog).values({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: outcomeId,
      action: "hearing_outcome_approved",
      changes: {
        outcome: outcome.outcome,
        caseId: outcome.caseId,
        transitionedToStageId,
      },
    });

    return { transitionedToStageId };
  });

  logger.info("Hearing outcome approved", {
    outcomeId,
    transitionedToStageId: result.transitionedToStageId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/hearings");
  return { success: true as const, ...result };
}

/**
 * Override an AI-detected outcome with a human-verified value. The original
 * AI outcome + confidence are preserved on the row so we can compute AI
 * accuracy over time.
 */
export async function overrideAiOutcome(
  outcomeId: string,
  newOutcome: string,
  reason: string,
) {
  const session = await requireSession();

  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new Error("A reason is required when overriding an AI outcome.");
  }
  assertValidOutcome(newOutcome);

  const [existing] = await db
    .select({
      id: hearingOutcomes.id,
      caseId: hearingOutcomes.caseId,
      outcome: hearingOutcomes.outcome,
      aiOutcome: hearingOutcomes.aiOutcome,
      aiConfidence: hearingOutcomes.aiConfidence,
      originalOutcome: hearingOutcomes.originalOutcome,
    })
    .from(hearingOutcomes)
    .where(
      and(
        eq(hearingOutcomes.id, outcomeId),
        eq(hearingOutcomes.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Hearing outcome not found");

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(hearingOutcomes)
      .set({
        outcome: newOutcome,
        // Preserve the AI's original call on first override. Don't clobber
        // on subsequent overrides.
        originalOutcome: existing.originalOutcome ?? existing.outcome,
        aiOutcome: existing.aiOutcome ?? existing.outcome,
        overrideReason: trimmedReason,
        overriddenAt: now,
        overriddenBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await tx.insert(auditLog).values({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: outcomeId,
      action: "hearing_outcome_ai_overridden",
      changes: {
        caseId: existing.caseId,
        fromOutcome: existing.outcome,
        toOutcome: newOutcome,
        aiConfidence: existing.aiConfidence,
      },
      metadata: { reason: trimmedReason },
    });
  });

  logger.info("AI hearing outcome overridden", {
    outcomeId,
    from: existing.outcome,
    to: newOutcome,
  });

  revalidatePath("/dashboard");
  revalidatePath("/hearings");
  return { success: true as const };
}

/**
 * Mark an approved outcome as fully processed (all downstream work done).
 */
export async function markOutcomeComplete(outcomeId: string) {
  const session = await requireSession();

  const [existing] = await db
    .select({
      id: hearingOutcomes.id,
      caseId: hearingOutcomes.caseId,
      status: hearingOutcomes.status,
      outcome: hearingOutcomes.outcome,
    })
    .from(hearingOutcomes)
    .where(
      and(
        eq(hearingOutcomes.id, outcomeId),
        eq(hearingOutcomes.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Hearing outcome not found");
  if (existing.status === "complete") {
    throw new Error("This outcome is already marked complete.");
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(hearingOutcomes)
      .set({
        status: "complete",
        completedAt: now,
        completedBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await tx.insert(auditLog).values({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: outcomeId,
      action: "hearing_outcome_completed",
      changes: {
        caseId: existing.caseId,
        outcome: existing.outcome,
        previousStatus: existing.status,
      },
    });
  });

  logger.info("Hearing outcome marked complete", {
    outcomeId,
    caseId: existing.caseId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/hearings");
  return { success: true as const };
}

/**
 * Log a new hearing outcome (human-entered, no AI confidence). Returns the
 * newly created outcome id.
 */
export async function logHearingOutcome(
  caseId: string,
  outcome: string,
  notes?: string,
) {
  const session = await requireSession();
  assertValidOutcome(outcome);

  const [caseRow] = await db
    .select({ id: cases.id, hearingDate: cases.hearingDate })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!caseRow) throw new Error("Case not found");

  const [inserted] = await db
    .insert(hearingOutcomes)
    .values({
      organizationId: session.organizationId,
      caseId,
      outcome,
      status: "pending_review",
      notes: notes?.trim() || null,
      hearingDate: caseRow.hearingDate ?? null,
      createdBy: session.id,
    })
    .returning({ id: hearingOutcomes.id });

  if (!inserted) throw new Error("Failed to log hearing outcome");

  await db.insert(auditLog).values({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "hearing_outcome",
    entityId: inserted.id,
    action: "hearing_outcome_logged",
    changes: {
      caseId,
      outcome,
    },
  });

  logger.info("Hearing outcome logged", {
    outcomeId: inserted.id,
    caseId,
    outcome,
  });

  revalidatePath("/dashboard");
  revalidatePath("/hearings");
  revalidatePath(`/cases/${caseId}`);
  return { success: true as const, outcomeId: inserted.id };
}
