import "server-only";
import { db } from "@/db/drizzle";
import {
  cases,
  caseRiskScores,
  tasks,
  communications,
  documents,
  supervisorEvents,
  complianceFindings,
  auditLog,
} from "@/db/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { classifyTrend } from "@/lib/services/pattern-analysis";
import { buildCaseContext } from "@/lib/services/case-context";

/**
 * Case risk scoring (PR-1) — heuristic weighted-sum, v2.
 *
 * Every input becomes a factor with its own `contribution` number, so
 * the UI can show exactly why a case is flagged. Weights are documented
 * inline. The raw sum is normalized to 0..100 via `MAX_RAW` so band
 * thresholds (low/medium/high/critical) stay stable.
 *
 * v2 adds five new signals on top of the v1 weighted sum, recalibrates
 * the existing seven, and optionally attaches a short AI-generated
 * narrative for cases scoring ≥ 60.
 *
 * Factors (raw points out of MAX_RAW = 143):
 *   stage dwell time .............. 12   (was 18)
 *   overdue tasks ................. 10   (was 14)
 *   ALJ historical win rate ....... 10   (was 12)
 *   communications gap ............ 10   (was 14)
 *   MR completeness ...............  8   (was 10)
 *   hearing proximity + PHI combo . 15   (was 22)
 *   client sentiment (latest) .....  7   (was 10)
 *   --- existing total ............ 72
 *   risk trajectory ...............  8   NEW
 *   missed SSA deadlines ..........  20  NEW (10 per, cap 20)
 *   unresolved supervisor events ..  16  NEW (4 per, cap 16)
 *   open compliance findings ......  15  NEW (6/3/1, cap 15)
 *   sentiment trend ...............  12  NEW (all-or-nothing)
 *   --- new total ................. 71
 *   ================================
 *   MAX_RAW ....................... 143
 *
 * After rawScore → `score = round(rawScore * 100 / 143)` is capped to
 * [0,100] and the band is derived against legacy thresholds.
 */

const SCORER_VERSION = "v2";

// Factor weights — documented above.
const W_STAGE_DWELL = 12;
const W_OVERDUE_TASKS = 10;
const W_ALJ_WIN_RATE = 10;
const W_COMMS_GAP = 10;
const W_MR_COMPLETENESS = 8;
const W_HEARING_PHI = 15;
const W_SENTIMENT = 7;
const W_TRAJECTORY = 8;
const W_MISSED_SSA_DEADLINE_PER = 10;
const W_MISSED_SSA_DEADLINE_CAP = 20;
const W_UNRESOLVED_EVENT_PER = 4;
const W_UNRESOLVED_EVENT_CAP = 16;
const W_COMPLIANCE_CRITICAL = 6;
const W_COMPLIANCE_HIGH = 3;
const W_COMPLIANCE_MEDIUM = 1;
const W_COMPLIANCE_CAP = 15;
const W_SENTIMENT_TREND = 12;

const MAX_RAW =
  W_STAGE_DWELL +
  W_OVERDUE_TASKS +
  W_ALJ_WIN_RATE +
  W_COMMS_GAP +
  W_MR_COMPLETENESS +
  W_HEARING_PHI +
  W_SENTIMENT +
  W_TRAJECTORY +
  W_MISSED_SSA_DEADLINE_CAP +
  W_UNRESOLVED_EVENT_CAP +
  W_COMPLIANCE_CAP +
  W_SENTIMENT_TREND;

export type RiskFactor = {
  key: string;
  label: string;
  contribution: number; // 0..weight (in raw space)
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
 * Scale: 0-14d → 0, 30d → half, 90d+ → full weight.
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
 * ALJ historical win rate (only when hearing date + ALJ are set).
 * 0% win rate → full weight; 80%+ → 0.
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
  const ratio = 1 - clamp(aljWinRate / 0.8, 1);
  return {
    key: "alj_win_rate",
    label: "ALJ historical win rate",
    contribution: Math.round(ratio * W_ALJ_WIN_RATE),
    note: `ALJ ${aljName} at ${Math.round(aljWinRate * 100)}% win rate`,
  };
}

/**
 * Communications gap. 0d → 0, 30d+ → full.
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
 * MR completeness: how many medical_records category documents are on
 * file. <3 → full, 10+ → 0.
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
 * Client sentiment (latest window) — kept so v2 still credits a single
 * negative message, but at a lower weight since `scoreSentimentTrend`
 * below amplifies when the pattern persists.
 */
function scoreSentiment(
  negativeCount: number,
  recentLabels: string[],
): RiskFactor {
  const ratio = clamp(negativeCount / 3, 1);
  return {
    key: "client_sentiment",
    label: "Client sentiment (latest)",
    contribution: Math.round(ratio * W_SENTIMENT),
    note:
      negativeCount === 0
        ? "No negative sentiment detected"
        : `${negativeCount} negative signal${negativeCount === 1 ? "" : "s"}: ${recentLabels.slice(0, 3).join(", ")}`,
  };
}

/**
 * (v2) Risk trajectory — trend over last ≤3 historical scores for this
 * case. Declining trend (score getting worse) adds full weight.
 */
function scoreTrajectory(history: number[]): RiskFactor {
  if (history.length < 2) {
    return {
      key: "risk_trajectory",
      label: "Risk trajectory",
      contribution: 0,
      note: "Not enough history",
    };
  }
  const trend = classifyTrend(history, "lower_is_better");
  if (trend === "declining") {
    return {
      key: "risk_trajectory",
      label: "Risk trajectory",
      contribution: W_TRAJECTORY,
      note: `Scores rising over last ${history.length} snapshots`,
    };
  }
  if (trend === "improving") {
    return {
      key: "risk_trajectory",
      label: "Risk trajectory",
      contribution: 0,
      note: "Scores improving",
    };
  }
  return {
    key: "risk_trajectory",
    label: "Risk trajectory",
    contribution: 0,
    note: "Stable trend",
  };
}

/**
 * (v2) Missed SSA deadlines — count of past-due, non-complete tasks
 * whose `sourceEventId` stamps them as event-driven. 10 points each,
 * capped at 20.
 */
function scoreMissedSsaDeadlines(count: number): RiskFactor {
  const contribution = Math.min(
    W_MISSED_SSA_DEADLINE_CAP,
    count * W_MISSED_SSA_DEADLINE_PER,
  );
  return {
    key: "missed_ssa_deadlines",
    label: "Missed SSA deadlines",
    contribution,
    note:
      count === 0
        ? "No event-driven deadlines missed"
        : `${count} event-driven task${count === 1 ? "" : "s"} past due`,
  };
}

/**
 * (v2) Unresolved supervisor events — open events on this case. Each
 * adds 4 points, capped at 16.
 */
function scoreUnresolvedEvents(count: number): RiskFactor {
  const contribution = Math.min(
    W_UNRESOLVED_EVENT_CAP,
    count * W_UNRESOLVED_EVENT_PER,
  );
  return {
    key: "unresolved_events",
    label: "Unresolved supervisor events",
    contribution,
    note:
      count === 0
        ? "All supervisor events resolved"
        : `${count} unresolved event${count === 1 ? "" : "s"}`,
  };
}

/**
 * (v2) Open compliance findings — each finding contributes by severity:
 * critical 6, high 3, medium 1, capped at 15 total.
 */
function scoreComplianceFindings(
  critical: number,
  high: number,
  medium: number,
): RiskFactor {
  const raw =
    critical * W_COMPLIANCE_CRITICAL +
    high * W_COMPLIANCE_HIGH +
    medium * W_COMPLIANCE_MEDIUM;
  const contribution = Math.min(W_COMPLIANCE_CAP, raw);
  const total = critical + high + medium;
  return {
    key: "compliance_findings",
    label: "Open compliance findings",
    contribution,
    note:
      total === 0
        ? "No open compliance findings"
        : `${total} open finding${total === 1 ? "" : "s"} (${critical}C/${high}H/${medium}M)`,
  };
}

/**
 * (v2) Sentiment trend — last 5 inbound communications. ≥3 in the
 * negative bucket gets the full weight.
 */
function scoreSentimentTrend(
  recentInboundLabels: Array<string | null>,
): RiskFactor {
  const negatives = recentInboundLabels.filter(
    (l) => l === "frustrated" || l === "angry" || l === "churn_risk",
  ).length;
  const sampleSize = recentInboundLabels.length;
  if (negatives >= 3) {
    return {
      key: "sentiment_trend",
      label: "Sentiment trend (5 msgs)",
      contribution: W_SENTIMENT_TREND,
      note: `${negatives}/${sampleSize} recent inbound msgs negative`,
    };
  }
  return {
    key: "sentiment_trend",
    label: "Sentiment trend (5 msgs)",
    contribution: 0,
    note:
      sampleSize === 0
        ? "No recent inbound messages"
        : `${negatives}/${sampleSize} recent negative — below threshold`,
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
  // v2 signals
  missedSsaDeadlineCount: number;
  unresolvedEventCount: number;
  complianceCriticalCount: number;
  complianceHighCount: number;
  complianceMediumCount: number;
  recentInboundSentimentLabels: Array<string | null>;
  historyScores: number[];
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

  const [
    overdueTaskRows,
    lastCommRows,
    mrDocRows,
    sentimentRows,
    aljStatsRows,
    missedSsaRows,
    unresolvedEventRows,
    complianceRows,
    recentInboundRows,
    historyRows,
  ] = await Promise.all([
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
    // v2: missed SSA deadlines — event-driven tasks past due
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.caseId, caseId),
          isNull(tasks.deletedAt),
          lt(tasks.dueDate, now),
          sql`${tasks.status} NOT IN ('completed', 'skipped')`,
          sql`${tasks.sourceEventId} IS NOT NULL`,
        ),
      ),
    // v2: unresolved supervisor events (not 'resolved' / 'dismissed')
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.caseId, caseId),
          sql`${supervisorEvents.status} NOT IN ('resolved','dismissed')`,
        ),
      ),
    // v2: open compliance findings bucketed by severity
    db
      .select({
        severity: complianceFindings.severity,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(complianceFindings)
      .where(
        and(
          eq(complianceFindings.caseId, caseId),
          eq(complianceFindings.status, "open"),
        ),
      )
      .groupBy(complianceFindings.severity),
    // v2: last 5 INBOUND comms, any sentiment label (for trend check)
    db
      .select({ label: communications.sentimentLabel })
      .from(communications)
      .where(
        and(
          eq(communications.caseId, caseId),
          eq(communications.direction, "inbound"),
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(5),
    // v2: previous ≤3 risk score snapshots from audit_log, newest first
    db
      .select({
        changes: auditLog.changes,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "case_risk_score"),
          eq(auditLog.entityId, caseId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(3),
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

  const missedSsaDeadlineCount = Number(missedSsaRows[0]?.count ?? 0);
  const unresolvedEventCount = Number(unresolvedEventRows[0]?.count ?? 0);

  let complianceCriticalCount = 0;
  let complianceHighCount = 0;
  let complianceMediumCount = 0;
  for (const r of complianceRows) {
    const n = Number(r.count ?? 0);
    if (r.severity === "critical") complianceCriticalCount = n;
    else if (r.severity === "high") complianceHighCount = n;
    else if (r.severity === "medium") complianceMediumCount = n;
  }

  const recentInboundSentimentLabels = recentInboundRows.map((r) => r.label);

  // History is newest-first from audit log; classifyTrend wants oldest
  // first, so we reverse.
  const historyScores: number[] = [];
  for (const r of historyRows) {
    const changes = (r.changes ?? {}) as { score?: number };
    if (typeof changes.score === "number") {
      historyScores.unshift(changes.score);
    }
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
    missedSsaDeadlineCount,
    unresolvedEventCount,
    complianceCriticalCount,
    complianceHighCount,
    complianceMediumCount,
    recentInboundSentimentLabels,
    historyScores,
  };
}

/**
 * Build a short (2-3 sentence) narrative explaining the top risk
 * factors. Fails soft — returns null on any error so the scorer still
 * persists the numeric result.
 */
async function generateRiskNarrative(
  caseId: string,
  score: number,
  topFactors: RiskFactor[],
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const ctx = await buildCaseContext(caseId, {
      communicationsLimit: 5,
      chronologyLimit: 5,
      documentsLimit: 5,
      stageHistoryLimit: 3,
    });
    if (!ctx) return null;

    const claimantName = ctx.claimant
      ? `${ctx.claimant.firstName} ${ctx.claimant.lastName}`
      : "the claimant";
    const stage = ctx.caseMeta.stageName ?? "unknown stage";
    const hearing = ctx.caseMeta.hearingDate
      ? ctx.caseMeta.hearingDate.toISOString().split("T")[0]
      : "none";

    const factorSummary = topFactors
      .map((f) => `- ${f.label}: ${f.note} (+${f.contribution})`)
      .join("\n");

    const prompt = `You are briefing a Social Security disability case manager on WHY a case just flagged high-risk. Output 2-3 sentences of plain English — no headings, no bullets, no filler. Focus on the top factors below and what the case manager should pay attention to.

Case: ${ctx.caseMeta.caseNumber} (${claimantName})
Stage: ${stage}
Hearing date: ${hearing}
Computed risk score: ${score}/100

Top contributing factors:
${factorSummary}

Narrative:`;

    // Import lazily so the scorer doesn't pay the SDK init cost when
    // ANTHROPIC_API_KEY isn't set.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text.trim() : null;
    return text && text.length > 0 ? text : null;
  } catch (err) {
    logger.warn("risk-scorer: narrative generation failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
    scoreTrajectory(signals.historyScores),
    scoreMissedSsaDeadlines(signals.missedSsaDeadlineCount),
    scoreUnresolvedEvents(signals.unresolvedEventCount),
    scoreComplianceFindings(
      signals.complianceCriticalCount,
      signals.complianceHighCount,
      signals.complianceMediumCount,
    ),
    scoreSentimentTrend(signals.recentInboundSentimentLabels),
  ];

  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  // Normalize raw sum (0..MAX_RAW) back into 0..100 space so the band
  // thresholds stay stable across v1 → v2.
  const normalized = Math.round((rawScore / MAX_RAW) * 100);
  const score = Math.min(100, Math.max(0, normalized));
  const riskBand = deriveRiskBand(score);

  // Build the factors payload, including an optional AI narrative when
  // the case is worth narrating. Stored as the first entry with key
  // `ai_narrative` so the UI can pick it out without a schema change.
  const factorsPayload: RiskFactor[] = [...factors];

  if (score >= 60) {
    const topFactors = [...factors]
      .filter((f) => f.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3);
    const narrative = await generateRiskNarrative(caseId, score, topFactors);
    if (narrative) {
      factorsPayload.unshift({
        key: "ai_narrative",
        label: "AI narrative",
        contribution: 0,
        note: narrative,
      });
    }
  }

  try {
    await db
      .insert(caseRiskScores)
      .values({
        organizationId: signals.organizationId,
        caseId,
        score,
        riskBand,
        factors: factorsPayload,
        scorerVersion: SCORER_VERSION,
        scoredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: caseRiskScores.caseId,
        set: {
          score,
          riskBand,
          factors: factorsPayload,
          scorerVersion: SCORER_VERSION,
          scoredAt: new Date(),
          updatedAt: new Date(),
        },
      });

    // Append to audit log so subsequent runs can see trajectory.
    await db.insert(auditLog).values({
      organizationId: signals.organizationId,
      entityType: "case_risk_score",
      entityId: caseId,
      action: "scored",
      changes: { score, riskBand, scorerVersion: SCORER_VERSION },
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
