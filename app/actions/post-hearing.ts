"use server";

import { db } from "@/db/drizzle";
import { hearingOutcomes, cases, leads, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { revalidatePath } from "next/cache";

/**
 * Post-Hearing Processing workspace server actions.
 *
 * Feeds the `/post-hearing` page with hearing outcomes bucketed by
 * processing lifecycle:
 *   - Awaiting processing — outcomeReceivedAt set, no client notified yet
 *   - Client notified — clientNotifiedAt set, stage not advanced
 *   - Stage advanced — caseStageAdvancedAt set, processing not completed
 *   - Completed — processingCompletedAt set
 */

export type HearingOutcomeBucket =
  | "awaiting"
  | "client_notified"
  | "stage_advanced"
  | "completed";

export type HearingOutcomeRow = {
  id: string;
  bucket: HearingOutcomeBucket;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: string;
  outcome: string | null;
  outcomeReceivedAt: string | null;
  clientNotifiedAt: string | null;
  caseStageAdvancedAt: string | null;
  postHearingTasksCreatedAt: string | null;
  processingCompletedAt: string | null;
  ageInDays: number;
  processedById: string | null;
  processedByName: string | null;
  progress: {
    clientNotified: boolean;
    stageAdvanced: boolean;
    tasksCreated: boolean;
    completed: boolean;
  };
};

export type HearingOutcomeWorkspace = {
  awaiting: HearingOutcomeRow[];
  clientNotified: HearingOutcomeRow[];
  stageAdvanced: HearingOutcomeRow[];
  completed: HearingOutcomeRow[];
  counts: {
    awaiting: number;
    clientNotified: number;
    stageAdvanced: number;
    completed: number;
  };
};

/**
 * Load every hearing outcome for the org, bucketed by processing step.
 * Ordered newest hearing first so the most recent decisions surface at
 * the top of each tab.
 */
export async function getHearingOutcomes(): Promise<HearingOutcomeWorkspace> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        hearingDate: hearingOutcomes.hearingDate,
        outcome: hearingOutcomes.outcome,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        caseStageAdvancedAt: hearingOutcomes.caseStageAdvancedAt,
        postHearingTasksCreatedAt: hearingOutcomes.postHearingTasksCreatedAt,
        processingCompletedAt: hearingOutcomes.processingCompletedAt,
        processedById: hearingOutcomes.processedBy,
        processedByFirstName: users.firstName,
        processedByLastName: users.lastName,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .leftJoin(users, eq(hearingOutcomes.processedBy, users.id))
      .where(eq(hearingOutcomes.organizationId, session.organizationId))
      .orderBy(desc(hearingOutcomes.hearingDate))
      .limit(500);

    const now = Date.now();

    const awaiting: HearingOutcomeRow[] = [];
    const clientNotified: HearingOutcomeRow[] = [];
    const stageAdvanced: HearingOutcomeRow[] = [];
    const completed: HearingOutcomeRow[] = [];

    for (const r of rows) {
      const claimantName =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant";
      const processedByName =
        r.processedByFirstName || r.processedByLastName
          ? `${r.processedByFirstName ?? ""} ${r.processedByLastName ?? ""}`.trim()
          : null;

      const ageInDays = Math.max(
        0,
        Math.floor((now - new Date(r.hearingDate).getTime()) / 86_400_000),
      );

      const progress = {
        clientNotified: r.clientNotifiedAt !== null,
        stageAdvanced: r.caseStageAdvancedAt !== null,
        tasksCreated: r.postHearingTasksCreatedAt !== null,
        completed: r.processingCompletedAt !== null,
      };

      let bucket: HearingOutcomeBucket;
      if (r.processingCompletedAt) {
        bucket = "completed";
      } else if (r.caseStageAdvancedAt) {
        bucket = "stage_advanced";
      } else if (r.clientNotifiedAt) {
        bucket = "client_notified";
      } else {
        bucket = "awaiting";
      }

      const row: HearingOutcomeRow = {
        id: r.id,
        bucket,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName,
        hearingDate: new Date(r.hearingDate).toISOString(),
        outcome: r.outcome,
        outcomeReceivedAt: r.outcomeReceivedAt
          ? new Date(r.outcomeReceivedAt).toISOString()
          : null,
        clientNotifiedAt: r.clientNotifiedAt
          ? new Date(r.clientNotifiedAt).toISOString()
          : null,
        caseStageAdvancedAt: r.caseStageAdvancedAt
          ? new Date(r.caseStageAdvancedAt).toISOString()
          : null,
        postHearingTasksCreatedAt: r.postHearingTasksCreatedAt
          ? new Date(r.postHearingTasksCreatedAt).toISOString()
          : null,
        processingCompletedAt: r.processingCompletedAt
          ? new Date(r.processingCompletedAt).toISOString()
          : null,
        ageInDays,
        processedById: r.processedById,
        processedByName,
        progress,
      };

      switch (bucket) {
        case "awaiting":
          awaiting.push(row);
          break;
        case "client_notified":
          clientNotified.push(row);
          break;
        case "stage_advanced":
          stageAdvanced.push(row);
          break;
        case "completed":
          completed.push(row);
          break;
      }
    }

    return {
      awaiting,
      clientNotified,
      stageAdvanced,
      completed,
      counts: {
        awaiting: awaiting.length,
        clientNotified: clientNotified.length,
        stageAdvanced: stageAdvanced.length,
        completed: completed.length,
      },
    };
  } catch (err) {
    logger.error("getHearingOutcomes failed", { error: err });
    return {
      awaiting: [],
      clientNotified: [],
      stageAdvanced: [],
      completed: [],
      counts: {
        awaiting: 0,
        clientNotified: 0,
        stageAdvanced: 0,
        completed: 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Workflow actions: approve-notify / override / mark-complete / set-outcome
// ─────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> = {
  success: boolean;
  message?: string;
  data?: T;
};

export type HearingOutcomeValue =
  | "favorable"
  | "unfavorable"
  | "partially_favorable"
  | "dismissed"
  | "postponed";

const VALID_OUTCOMES: HearingOutcomeValue[] = [
  "favorable",
  "unfavorable",
  "partially_favorable",
  "dismissed",
  "postponed",
];

// ─────────────────────────────────────────────────────────────
// Dropdown payloads for the subnav dialogs
// ─────────────────────────────────────────────────────────────

/** Oldest outcome awaiting client-notification sign-off (for approve dialog). */
export type PendingNotificationOutcome = {
  outcomeId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  outcome: string | null;
  outcomeReceivedAt: string | null;
  hearingDate: string;
};

export async function getPendingNotificationOutcome(): Promise<PendingNotificationOutcome | null> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select({
        outcomeId: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        outcome: hearingOutcomes.outcome,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        hearingDate: hearingOutcomes.hearingDate,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(hearingOutcomes.organizationId, session.organizationId),
          isNotNull(hearingOutcomes.outcomeReceivedAt),
          isNull(hearingOutcomes.clientNotifiedAt),
        ),
      )
      .orderBy(asc(hearingOutcomes.outcomeReceivedAt))
      .limit(1);

    if (!row) return null;

    const claimantName =
      row.leadFirstName || row.leadLastName
        ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
        : "Unknown Claimant";

    return {
      outcomeId: row.outcomeId,
      caseId: row.caseId,
      caseNumber: row.caseNumber ?? "—",
      claimantName,
      outcome: row.outcome,
      outcomeReceivedAt: row.outcomeReceivedAt
        ? new Date(row.outcomeReceivedAt).toISOString()
        : null,
      hearingDate: new Date(row.hearingDate).toISOString(),
    };
  } catch (err) {
    logger.error("getPendingNotificationOutcome failed", { error: err });
    return null;
  }
}

/** Outcomes populated by AI/ERE scraper but not yet signed off by a human. */
export type OverrideCandidate = {
  outcomeId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  outcome: string;
  hearingDate: string;
};

export async function getOverrideCandidates(): Promise<OverrideCandidate[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        outcomeId: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        outcome: hearingOutcomes.outcome,
        hearingDate: hearingOutcomes.hearingDate,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(hearingOutcomes.organizationId, session.organizationId),
          isNotNull(hearingOutcomes.outcome),
          isNull(hearingOutcomes.processingCompletedAt),
        ),
      )
      .orderBy(desc(hearingOutcomes.hearingDate))
      .limit(25);

    return rows.map((r) => ({
      outcomeId: r.outcomeId,
      caseId: r.caseId,
      caseNumber: r.caseNumber ?? "—",
      claimantName:
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant",
      outcome: r.outcome ?? "",
      hearingDate: new Date(r.hearingDate).toISOString(),
    }));
  } catch (err) {
    logger.error("getOverrideCandidates failed", { error: err });
    return [];
  }
}

/** Oldest outcome with client notified but processing not yet complete. */
export type PendingCompletionOutcome = {
  outcomeId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  outcome: string | null;
  clientNotifiedAt: string | null;
  hearingDate: string;
};

export async function getPendingCompletionOutcome(): Promise<PendingCompletionOutcome | null> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select({
        outcomeId: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        outcome: hearingOutcomes.outcome,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        hearingDate: hearingOutcomes.hearingDate,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(hearingOutcomes.organizationId, session.organizationId),
          isNotNull(hearingOutcomes.clientNotifiedAt),
          isNull(hearingOutcomes.processingCompletedAt),
        ),
      )
      .orderBy(asc(hearingOutcomes.clientNotifiedAt))
      .limit(1);

    if (!row) return null;

    const claimantName =
      row.leadFirstName || row.leadLastName
        ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
        : "Unknown Claimant";

    return {
      outcomeId: row.outcomeId,
      caseId: row.caseId,
      caseNumber: row.caseNumber ?? "—",
      claimantName,
      outcome: row.outcome,
      clientNotifiedAt: row.clientNotifiedAt
        ? new Date(row.clientNotifiedAt).toISOString()
        : null,
      hearingDate: new Date(row.hearingDate).toISOString(),
    };
  } catch (err) {
    logger.error("getPendingCompletionOutcome failed", { error: err });
    return null;
  }
}

/** Hearings that have occurred but have no outcome recorded yet. */
export type UnrecordedOutcome = {
  outcomeId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: string;
};

export async function getUnrecordedOutcomes(): Promise<UnrecordedOutcome[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        outcomeId: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        hearingDate: hearingOutcomes.hearingDate,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(hearingOutcomes.organizationId, session.organizationId),
          isNull(hearingOutcomes.outcome),
          lte(hearingOutcomes.hearingDate, new Date()),
        ),
      )
      .orderBy(desc(hearingOutcomes.hearingDate))
      .limit(25);

    return rows.map((r) => ({
      outcomeId: r.outcomeId,
      caseId: r.caseId,
      caseNumber: r.caseNumber ?? "—",
      claimantName:
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant",
      hearingDate: new Date(r.hearingDate).toISOString(),
    }));
  } catch (err) {
    logger.error("getUnrecordedOutcomes failed", { error: err });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * Approve the client-notification step for a hearing outcome.
 * Stamps `clientNotifiedAt = now()` (only when currently null).
 */
export async function approveClientNotification(
  outcomeId: string,
): Promise<ActionResult<{ caseId: string }>> {
  const session = await requireSession();

  try {
    const [row] = await db
      .select({
        id: hearingOutcomes.id,
        organizationId: hearingOutcomes.organizationId,
        caseId: hearingOutcomes.caseId,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
      })
      .from(hearingOutcomes)
      .where(eq(hearingOutcomes.id, outcomeId))
      .limit(1);

    if (!row) return { success: false, message: "Outcome not found" };
    if (row.organizationId !== session.organizationId) {
      return { success: false, message: "Not authorized" };
    }
    if (!row.outcomeReceivedAt) {
      return {
        success: false,
        message: "Outcome has not been received yet",
      };
    }
    if (row.clientNotifiedAt) {
      return {
        success: false,
        message: "Client has already been notified",
      };
    }

    const now = new Date();

    await db
      .update(hearingOutcomes)
      .set({
        clientNotifiedAt: now,
        processedBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await logPhiModification({
      organizationId: row.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: row.id,
      caseId: row.caseId,
      operation: "update",
      action: "hearing_outcome_notification_approved",
      metadata: { source: "post_hearing_subnav" },
    });

    revalidatePath("/post-hearing");
    revalidatePath(`/cases/${row.caseId}`);

    return {
      success: true,
      message: "Client notification approved",
      data: { caseId: row.caseId },
    };
  } catch (err) {
    logger.error("approveClientNotification failed", {
      outcomeId,
      error: err,
    });
    return { success: false, message: "Could not approve notification" };
  }
}

/**
 * Override an AI-populated outcome. Writes the new outcome, appends a
 * human-readable override note, stamps `processedBy`, and captures the
 * original value in the audit log for HIPAA traceability.
 */
export async function overrideOutcome(
  outcomeId: string,
  newOutcome: HearingOutcomeValue,
  reason: string,
): Promise<ActionResult<{ caseId: string }>> {
  const session = await requireSession();

  if (!VALID_OUTCOMES.includes(newOutcome)) {
    return { success: false, message: "Invalid outcome" };
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    return { success: false, message: "Reason is required to override" };
  }

  try {
    const [row] = await db
      .select({
        id: hearingOutcomes.id,
        organizationId: hearingOutcomes.organizationId,
        caseId: hearingOutcomes.caseId,
        outcome: hearingOutcomes.outcome,
        notes: hearingOutcomes.notes,
      })
      .from(hearingOutcomes)
      .where(eq(hearingOutcomes.id, outcomeId))
      .limit(1);

    if (!row) return { success: false, message: "Outcome not found" };
    if (row.organizationId !== session.organizationId) {
      return { success: false, message: "Not authorized" };
    }

    const priorOutcome = row.outcome ?? "unspecified";
    const now = new Date();
    const overrideLine = `[Override from ${priorOutcome}: ${trimmedReason}]`;
    const mergedNotes = row.notes
      ? `${row.notes}\n${overrideLine}`
      : overrideLine;

    await db
      .update(hearingOutcomes)
      .set({
        outcome: newOutcome,
        notes: mergedNotes,
        processedBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await logPhiModification({
      organizationId: row.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: row.id,
      caseId: row.caseId,
      operation: "update",
      action: "hearing_outcome_overridden",
      changes: { before: { outcome: priorOutcome }, after: { outcome: newOutcome } },
      metadata: {
        source: "post_hearing_subnav",
        reason: trimmedReason,
        priorOutcome,
      },
    });

    revalidatePath("/post-hearing");
    revalidatePath(`/cases/${row.caseId}`);

    return {
      success: true,
      message: `Outcome overridden to ${newOutcome}`,
      data: { caseId: row.caseId },
    };
  } catch (err) {
    logger.error("overrideOutcome failed", { outcomeId, error: err });
    return { success: false, message: "Could not override outcome" };
  }
}

/**
 * Mark processing complete for a hearing outcome.
 * Stamps `processingCompletedAt = now()` (only when currently null).
 */
export async function markOutcomeComplete(
  outcomeId: string,
): Promise<ActionResult<{ caseId: string }>> {
  const session = await requireSession();

  try {
    const [row] = await db
      .select({
        id: hearingOutcomes.id,
        organizationId: hearingOutcomes.organizationId,
        caseId: hearingOutcomes.caseId,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        processingCompletedAt: hearingOutcomes.processingCompletedAt,
      })
      .from(hearingOutcomes)
      .where(eq(hearingOutcomes.id, outcomeId))
      .limit(1);

    if (!row) return { success: false, message: "Outcome not found" };
    if (row.organizationId !== session.organizationId) {
      return { success: false, message: "Not authorized" };
    }
    if (!row.clientNotifiedAt) {
      return {
        success: false,
        message: "Client must be notified before marking complete",
      };
    }
    if (row.processingCompletedAt) {
      return {
        success: false,
        message: "Processing is already complete",
      };
    }

    const now = new Date();

    await db
      .update(hearingOutcomes)
      .set({
        processingCompletedAt: now,
        processedBy: session.id,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await logPhiModification({
      organizationId: row.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: row.id,
      caseId: row.caseId,
      operation: "update",
      action: "hearing_outcome_marked_complete",
      metadata: { source: "post_hearing_subnav" },
    });

    revalidatePath("/post-hearing");
    revalidatePath(`/cases/${row.caseId}`);

    return {
      success: true,
      message: "Processing marked complete",
      data: { caseId: row.caseId },
    };
  } catch (err) {
    logger.error("markOutcomeComplete failed", { outcomeId, error: err });
    return { success: false, message: "Could not mark complete" };
  }
}

/**
 * Record the outcome for a hearing that has no outcome yet.
 * Sets `outcome`, stamps `outcomeReceivedAt = now()`, and optionally
 * appends notes. `processedBy` is set to the acting user.
 */
export async function setHearingOutcome(
  outcomeId: string,
  outcome: HearingOutcomeValue,
  notes?: string,
): Promise<ActionResult<{ caseId: string }>> {
  const session = await requireSession();

  if (!VALID_OUTCOMES.includes(outcome)) {
    return { success: false, message: "Invalid outcome" };
  }

  try {
    const [row] = await db
      .select({
        id: hearingOutcomes.id,
        organizationId: hearingOutcomes.organizationId,
        caseId: hearingOutcomes.caseId,
        outcome: hearingOutcomes.outcome,
        notes: hearingOutcomes.notes,
      })
      .from(hearingOutcomes)
      .where(eq(hearingOutcomes.id, outcomeId))
      .limit(1);

    if (!row) return { success: false, message: "Outcome not found" };
    if (row.organizationId !== session.organizationId) {
      return { success: false, message: "Not authorized" };
    }
    if (row.outcome) {
      return {
        success: false,
        message: "Outcome already recorded — use Override instead",
      };
    }

    const now = new Date();
    const trimmed = notes?.trim() ?? "";
    const mergedNotes = trimmed
      ? row.notes
        ? `${row.notes}\n${trimmed}`
        : trimmed
      : row.notes;

    await db
      .update(hearingOutcomes)
      .set({
        outcome,
        outcomeReceivedAt: now,
        processedBy: session.id,
        notes: mergedNotes ?? null,
        updatedAt: now,
      })
      .where(eq(hearingOutcomes.id, outcomeId));

    await logPhiModification({
      organizationId: row.organizationId,
      userId: session.id,
      entityType: "hearing_outcome",
      entityId: row.id,
      caseId: row.caseId,
      operation: "update",
      action: "hearing_outcome_recorded",
      metadata: {
        source: "post_hearing_subnav",
        outcome,
        hasNotes: trimmed.length > 0,
      },
    });

    revalidatePath("/post-hearing");
    revalidatePath(`/cases/${row.caseId}`);

    return {
      success: true,
      message: `Outcome recorded: ${outcome}`,
      data: { caseId: row.caseId },
    };
  } catch (err) {
    logger.error("setHearingOutcome failed", { outcomeId, error: err });
    return { success: false, message: "Could not record outcome" };
  }
}
