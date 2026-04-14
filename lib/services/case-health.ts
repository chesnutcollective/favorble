import "server-only";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { classifyTrend } from "@/lib/services/pattern-analysis";
import { logger } from "@/lib/logger/server";

/**
 * QA-3 — Case health signal from aggregated sentiment.
 *
 * Rolls up the most recent sentiment-labeled communications on a case
 * into a single "health" number 0-100, along with the labels powering
 * the score and a trend direction. Feeds the client-health supervisor
 * dashboard and the at-risk badge on the cases table.
 */

export type SentimentLabel =
  | "positive"
  | "neutral"
  | "confused"
  | "frustrated"
  | "angry"
  | "churn_risk";

export type CaseHealth = {
  caseId: string;
  score: number; // 0-100, higher is healthier
  recentLabels: SentimentLabel[];
  trend: "improving" | "declining" | "stable";
  sampleSize: number;
  mostRecentLabel: SentimentLabel | null;
  mostRecentAt: Date | null;
};

const LABEL_WEIGHT: Record<SentimentLabel, number> = {
  positive: 1,
  neutral: 0.6,
  confused: 0.4,
  frustrated: 0.2,
  angry: 0.05,
  churn_risk: 0,
};

const AT_RISK_LABELS = new Set<SentimentLabel>([
  "frustrated",
  "angry",
  "churn_risk",
]);

export function isAtRiskLabel(label: string | null | undefined): boolean {
  return label ? AT_RISK_LABELS.has(label as SentimentLabel) : false;
}

const RECENT_WINDOW = 10;

/**
 * Aggregate sentiment across a case's communications. Uses
 * `classifyTrend` from pattern-analysis to detect improvement or
 * decline over time.
 */
export async function getCaseHealth(
  caseId: string,
): Promise<CaseHealth | null> {
  try {
    const rows = await db
      .select({
        id: communications.id,
        label: communications.sentimentLabel,
        score: communications.sentimentScore,
        createdAt: communications.createdAt,
      })
      .from(communications)
      .where(
        and(
          eq(communications.caseId, caseId),
          isNotNull(communications.sentimentLabel),
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(RECENT_WINDOW);

    if (rows.length === 0) {
      return {
        caseId,
        score: 70, // Neutral default for cases with no sentiment signal yet.
        recentLabels: [],
        trend: "stable",
        sampleSize: 0,
        mostRecentLabel: null,
        mostRecentAt: null,
      };
    }

    const labels = rows.map((r) => r.label as SentimentLabel);
    const weighted = labels.reduce(
      (sum, label) => sum + (LABEL_WEIGHT[label] ?? 0.5),
      0,
    );
    const score = Math.round((weighted / labels.length) * 100);

    // Trend: oldest → newest with numeric labels (higher = better)
    const chronological = [...rows]
      .reverse()
      .map((r) => LABEL_WEIGHT[r.label as SentimentLabel] ?? 0.5);
    const trend = classifyTrend(chronological, "higher_is_better");

    return {
      caseId,
      score,
      recentLabels: labels,
      trend,
      sampleSize: rows.length,
      mostRecentLabel: labels[0] ?? null,
      mostRecentAt: rows[0]?.createdAt ?? null,
    };
  } catch (err) {
    logger.error("case-health: getCaseHealth failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Batch variant for dashboards. Fetches the most-recent N labeled
 * communications for each case in `caseIds` and computes a health
 * record per case. Cases with no labeled comms get a neutral default.
 */
export async function getCaseHealthForCases(
  caseIds: string[],
): Promise<Map<string, CaseHealth>> {
  const result = new Map<string, CaseHealth>();
  if (caseIds.length === 0) return result;

  // Simple N+1 fan-out — keeps the logic readable and the dashboards
  // already paginate to ~50 cases at a time. Can be swapped for a
  // window-function query later if it becomes a hot path.
  await Promise.all(
    caseIds.map(async (id) => {
      const h = await getCaseHealth(id);
      if (h) result.set(id, h);
    }),
  );

  return result;
}
