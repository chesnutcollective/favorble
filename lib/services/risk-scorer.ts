import "server-only";
import { db } from "@/db/drizzle";
import {
  cases,
  caseRiskScores,
  tasks,
  communications,
  documents,
  caseStageTransitions,
} from "@/db/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Case risk scoring (PR-1) — heuristic weighted-sum variant.
 *
 * The scorer is deliberately explainable: every input becomes a factor
 * with its own `contribution` number, so the UI can show exactly why a
 * case is flagged. Weights are documented inline and MUST sum to 100 —
 * that makes the maximum possible score 100 without per-factor
 * normalization gymnastics.
 *
 * v1 factors (points out of 100):
 *   stage dwell time .............. 18
 *   overdue tasks ................. 14
 *   ALJ historical win rate ....... 12   (only if hearingDate set)
 *   communications gap ............ 14
 *   MR completeness ............... 10
 *   hearing proximity + PHI combo . 22   (compound signal)
 *   client sentiment .............. 10
 *   -------
 *   total .........................100
 *
 * Riskier cases accumulate higher contributions from each factor. The
 * total is capped at 100 for safety.
 */

const SCORER_VERSION = "v1";

// Factor weights — documented above. Must sum to 100.
const W_STAGE_DWELL = 18;
const W_OVERDUE_TASKS = 14;
const W_ALJ_WIN_RATE = 12;
const W_COMMS_GAP = 14;
const W_MR_COMPLETENESS = 10;
const W_HEARING_PHI = 22;
const W_SENTIMENT = 10;

export type RiskFactor = {
  key: string;
  label: string;
  contribution: number; // 0..weight
  note: string;
};

export type RiskBand = "low" | "medium" | "high" | "critical";

export type RiskScoreResult = {
  caseId: string;
  score: number;
  riskBand: RiskBand;
  factors: RiskFactor[];
};

export function deriveRiskBand(score: number): RiskBand {
  if (score >= 86) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

/**
 * Helper: clamp a value to [0, max].
 */
function clamp(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * Stage dwell time: more days in the current stage → more points.
 * Scale: 0d → 0, 30d → half, 90d+ → full weight.
 */
function scoreStageDwell(stageEnteredAt: Date | null): RiskFactor {
  if (!stageEnteredAt) {
    return {
      key: "stage_dwell",
      label: "Stage dwell time",
      contribution: 0,
      note: "No stage-entered timestamp",
    };
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - stageEnteredAt.getTime()) / 86400000),
  );
  let ratio: number;
  if (days <= 14) ratio = 0;
  else if (days >= 90) ratio = 1;
  else ratio = (days - 14) / (90 - 14);
  return {
    key: "stage_dwell",
    label: "Stage dwell time",
    contribution: Math.round(ratio * W_STAGE_DWELL),
    note: `${days} days in current stage`,
  };
}

/**
 * Overdue task count. 0 → 0, 5+ → full weight.
 */
function scoreOverdueTasks(overdueCount: number): RiskFactor {
  const ratio = clamp(overdueCount / 5, 1);
  return {
    key: "overdue_tasks",
    label: "Overdue tasks",
    contribution: Math.round(ratio * W_OVERDUE_TASKS),
    note: `${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`,
  };
}

/**
 * ALJ historical win rate (if this case has a hearing date set and an
 * ALJ assigned). Lower win rate → higher risk. Only applies once we
 * know who the judge is.
 */
function scoreAljWinRate(
  hearingDate: Date | null,
  aljName: string | null,
  aljWinRate: number | null,
): RiskFactor {
  if (!hearingDate || !aljName) {
    return {
      key: "alj_win_rate",
      label: "ALJ historical win rate",
      contribution: 0,
      note: "No hearing date or ALJ assigned",
    };
  }
  if (aljWinRate === null) {
    return {
      key: "alj_win_rate",
      label: "ALJ historical win rate",
      contribution: Math.round(W_ALJ_WIN_RATE * 0.25),
      note: `ALJ ${aljName} has no historical data — mild risk`,
    };
  }
  // 0% win rate → full weight; 80%+ → 0.
  const ratio = 1 - clamp(aljWinRate / 0.8, 1);
  return {
    key: "alj_win_rate",
    label: "ALJ historical win rate",
    contribution: Math.round(ratio * W_ALJ_WIN_RATE),
    note: `ALJ ${aljName} at ${Math.round(aljWinRate * 100)}% win rate`,
  };
}

/**
 * Communications gap: days since last inbound/outbound message.
 * 0d → 0, 30d+ → full.
 */
function scoreCommsGap(lastCommAt: Date | null): RiskFactor {
  if (!lastCommAt) {
    return {
      key: "comms_gap",
      label: "Communications gap",
      contribution: W_COMMS_GAP,
      note: "No communications on file",
    };
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - lastCommAt.getTime()) / 86400000),
  );
  const ratio = clamp(days / 30, 1);
  return {
    key: "comms_gap",
    label: "Communications gap",
    contribution: Math.round(ratio * W_COMMS_GAP),
    note: `${days} days since last communication`,
  };
}

/**
 * MR completeness: how many "medical_records" category documents are
 * on file. <3 → full, 10+ → 0.
 */
function scoreMrCompleteness(mrCount: number): RiskFactor {
  let ratio: number;
  if (mrCount <= 2) ratio = 1;
  else if (mrCount >= 10) ratio = 0;
  else ratio = 1 - (mrCount - 2) / 8;
  return {
    key: "mr_completeness",
    label: "Medical records completeness",
    contribution: Math.round(ratio * W_MR_COMPLETENESS),
    note: `${mrCount} medical record document${mrCount === 1 ? "" : "s"} on file`,
  };
}

/**
 * Compound signal: hearing approaching + PHI sheet incomplete.
 * - Hearing in ≤14 days with phi unassigned → full weight
 * - Hearing in 15-30 days with phi unassigned → half
 * - Hearing scheduled and phi complete → 0
 * - No hearing scheduled → 0
 */
function scoreHearingPhiCombo(
  hearingDate: Date | null,
  phiSheetStatus: string | null,
): RiskFactor {
  if (!hearingDate) {
    return {
      key: "hearing_phi_combo",
      label: "Hearing prep readiness",
      contribution: 0,
      note: "No hearing scheduled",
    };
  }
  const days = Math.floor(
    (hearingDate.getTime() - Date.now()) / 86400000,
  );
  const phiComplete = phiSheetStatus === "complete";
  if (phiComplete) {
    return {
      key: "hearing_phi_combo",
      label: "Hearing prep readiness",
      contribution: 0,
      note: `Hearing in ${days}d · PHI sheet complete`,
    };
  }
  if (days < 0) {
    return {
      key: "hearing_phi_combo",
      label: "Hearing prep readiness",
      contribution: Math.round(W_HEARING_PHI * 0.5),
      note: "Hearing date has passed — review PHI status",
    };
  }
  if (days <= 14) {
    return {
      key: "hearing_phi_combo",
      label: "Hearing prep readiness",
      contribution: W_HEARING_PHI,
      note: `Hearing in ${days}d with PHI sheet ${phiSheetStatus ?? "unassigned"}`,
    };
  }
  if (days <= 30) {
    return {
      key: "hearing_phi_combo",
      label: "Hearing prep readiness",
      contribution: Math.round(W_HEARING_PHI * 0.5),
      note: `Hearing in ${days}d with PHI sheet ${phiSheetStatus ?? "unassigned"}`,
    };
  }
  return {
    key: "hearing_phi_combo",
    label: "Hearing prep readiness",
    contribution: Math.round(W_HEARING_PHI * 0.15),
    note: `Hearing in ${days}d · PHI sheet ${phiSheetStatus ?? "unassigned"}`,
  };
}

/**
 * Client sentiment signal: angry/frustrated/churn-risk labels in the
 * recent comms get the full weight.
 */
function scoreSentiment(
  negativeCount: number,
  recentLabels: string[],
): RiskFactor {
  const ratio = clamp(negativeCount / 3, 1);
  return {
    key: "client_sentiment",
    label: "Client sentiment",
    contribution: Math.round(ratio * W_SENTIMENT),
    note:
      negativeCount === 0
        ? "No negative sentiment detected"
        : `${negativeCount} negative signal${negativeCount === 1 ? "" : "s"}: ${recentLabels.slice(0, 3).join(", ")}`,
  };
}

type CaseSignals = {
  caseId: string;
  organizationId: string;
  stageEnteredAt: Date | null;
  hearingDate: Date | null;
  adminLawJudge: string | null;
  phiSheetStatus: string | null;
  overdueTaskCount: number;
  lastCommAt: Date | null;
  mrDocCount: number;
  negativeSentimentCount: number;
  negativeSentimentLabels: string[];
  aljWinRate: number | null;
};

/**
 * Pull the signal bundle for a single case. Each sub-query is small and
 * scoped to `caseId`, so we can run this in parallel across many cases.
 */
async function loadCaseSignals(caseId: string): Promise<CaseSignals | null> {
  const [caseRow] = await db
    .select({
      id: cases.id,
      organizationId: cases.organizationId,
      stageEnteredAt: cases.stageEnteredAt,
      hearingDate: cases.hearingDate,
      adminLawJudge: cases.adminLawJudge,
      phiSheetStatus: cases.phiSheetStatus,
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
    .limit(1);

  if (!caseRow) return null;

  const now = new Date();

  const [overdueTaskRows, lastCommRows, mrDocRows, sentimentRows, aljStatsRows] =
    await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.caseId, caseId),
            isNull(tasks.deletedAt),
            lt(tasks.dueDate, now),
            sql`${tasks.status} NOT IN ('completed', 'skipped')`,
          ),
        ),
      db
        .select({ createdAt: communications.createdAt })
        .from(communications)
        .where(eq(communications.caseId, caseId))
        .orderBy(desc(communications.createdAt))
        .limit(1),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(documents)
        .where(
          and(
            eq(documents.caseId, caseId),
            isNull(documents.deletedAt),
            eq(documents.category, "medical_records"),
          ),
        ),
      db
        .select({
          label: communications.sentimentLabel,
        })
        .from(communications)
        .where(
          and(
            eq(communications.caseId, caseId),
            sql`${communications.sentimentLabel} IN ('frustrated', 'angry', 'churn_risk')`,
            sql`${communications.createdAt} > NOW() - INTERVAL '30 days'`,
          ),
        ),
      caseRow.adminLawJudge
        ? db.execute<{ won: number; lost: number }>(sql`
            SELECT
              SUM(CASE WHEN status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
              SUM(CASE WHEN status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
            FROM cases
            WHERE organization_id = ${caseRow.organizationId}
              AND admin_law_judge = ${caseRow.adminLawJudge}
              AND status IN ('closed_won', 'closed_lost')
              AND deleted_at IS NULL
          `)
        : Promise.resolve([] as Array<{ won: number; lost: number }>),
    ]);

  const overdueTaskCount = Number(overdueTaskRows[0]?.count ?? 0);
  const lastCommAt = lastCommRows[0]?.createdAt ?? null;
  const mrDocCount = Number(mrDocRows[0]?.count ?? 0);
  const negativeLabels: string[] = [];
  for (const r of sentimentRows) {
    if (r.label != null) negativeLabels.push(r.label);
  }
  const negativeSentimentCount = negativeLabels.length;

  let aljWinRate: number | null = null;
  if (aljStatsRows && aljStatsRows.length > 0) {
    const row = aljStatsRows[0];
    const won = Number(row.won ?? 0);
    const lost = Number(row.lost ?? 0);
    const total = won + lost;
    aljWinRate = total > 0 ? won / total : null;
  }

  return {
    caseId,
    organizationId: caseRow.organizationId,
    stageEnteredAt: caseRow.stageEnteredAt,
    hearingDate: caseRow.hearingDate,
    adminLawJudge: caseRow.adminLawJudge,
    phiSheetStatus: caseRow.phiSheetStatus,
    overdueTaskCount,
    lastCommAt,
    mrDocCount,
    negativeSentimentCount,
    negativeSentimentLabels: negativeLabels,
    aljWinRate,
  };
}

/**
 * Compute and persist a risk score for a single case.
 */
export async function scoreCase(caseId: string): Promise<RiskScoreResult | null> {
  const signals = await loadCaseSignals(caseId);
  if (!signals) return null;

  const factors: RiskFactor[] = [
    scoreStageDwell(signals.stageEnteredAt),
    scoreOverdueTasks(signals.overdueTaskCount),
    scoreAljWinRate(
      signals.hearingDate,
      signals.adminLawJudge,
      signals.aljWinRate,
    ),
    scoreCommsGap(signals.lastCommAt),
    scoreMrCompleteness(signals.mrDocCount),
    scoreHearingPhiCombo(signals.hearingDate, signals.phiSheetStatus),
    scoreSentiment(
      signals.negativeSentimentCount,
      signals.negativeSentimentLabels,
    ),
  ];

  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  const riskBand = deriveRiskBand(score);

  try {
    await db
      .insert(caseRiskScores)
      .values({
        organizationId: signals.organizationId,
        caseId,
        score,
        riskBand,
        factors,
        scorerVersion: SCORER_VERSION,
        scoredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: caseRiskScores.caseId,
        set: {
          score,
          riskBand,
          factors,
          scorerVersion: SCORER_VERSION,
          scoredAt: new Date(),
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.error("risk-scorer: failed to upsert", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return { caseId, score, riskBand, factors };
}

export type ScoreAllResult = {
  scanned: number;
  scored: number;
  failed: number;
};

/**
 * Score every active case in the org. Iterates with per-case error
 * tolerance so one bad case doesn't poison the sweep.
 */
export async function scoreAllActiveCases(): Promise<ScoreAllResult> {
  let scanned = 0;
  let scored = 0;
  let failed = 0;

  try {
    const rows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.status, "active"), isNull(cases.deletedAt)));

    for (const row of rows) {
      scanned++;
      try {
        const result = await scoreCase(row.id);
        if (result) scored++;
        else failed++;
      } catch (err) {
        failed++;
        logger.error("risk-scorer: case failure", {
          caseId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.error("risk-scorer: sweep failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { scanned, scored, failed };
}
