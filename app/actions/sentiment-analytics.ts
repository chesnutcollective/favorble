"use server";

import { db } from "@/db/drizzle";
import { requireSession } from "@/lib/auth/session";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import type { SentimentLabel } from "@/lib/services/case-health";

/**
 * QA-3 — Sentiment time-series analytics.
 *
 * Backs the org-wide trend chart on the client-health dashboard. Pulls
 * communications where sentimentAnalyzedAt is set and groups them per
 * day per label so the dashboard can render a stacked bar chart.
 */

export type SentimentTrendDay = {
  /** ISO date (yyyy-mm-dd) for the day in UTC. */
  date: string;
  counts: Record<SentimentLabel, number>;
  total: number;
};

const ALL_LABELS: SentimentLabel[] = [
  "positive",
  "neutral",
  "confused",
  "frustrated",
  "angry",
  "churn_risk",
];

function emptyCounts(): Record<SentimentLabel, number> {
  return {
    positive: 0,
    neutral: 0,
    confused: 0,
    frustrated: 0,
    angry: 0,
    churn_risk: 0,
  };
}

/**
 * Returns one row per day for the last `daysBack` days, padded with
 * zero-count days when no data is present so the chart axis stays
 * stable.
 */
export async function getOrgSentimentTrend(
  daysBack = 30,
): Promise<SentimentTrendDay[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const days = Math.max(1, Math.min(120, Math.floor(daysBack)));

  // Anchor "today" to UTC midnight so bucket boundaries are stable.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(todayUtc.getTime() - (days - 1) * 86_400_000);

  // Pre-seed the result map with empty days so the chart shows a
  // baseline tick even when nothing was analyzed that day.
  const buckets = new Map<string, Record<SentimentLabel, number>>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff.getTime() + i * 86_400_000);
    buckets.set(d.toISOString().slice(0, 10), emptyCounts());
  }

  try {
    const rows = await db.execute<{
      day: string;
      label: SentimentLabel;
      n: number;
    }>(sql`
      SELECT
        to_char(date_trunc('day', sentiment_analyzed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        sentiment_label::text AS label,
        COUNT(*)::int AS n
      FROM communications
      WHERE organization_id = ${orgId}
        AND sentiment_analyzed_at IS NOT NULL
        AND sentiment_label IS NOT NULL
        AND sentiment_analyzed_at >= ${cutoff.toISOString()}::timestamptz
      GROUP BY 1, 2
      ORDER BY 1
    `);

    for (const r of rows) {
      const bucket = buckets.get(r.day);
      if (!bucket) continue;
      const label = r.label as SentimentLabel;
      if (ALL_LABELS.includes(label)) {
        bucket[label] = Number(r.n);
      }
    }
  } catch (err) {
    logger.error("getOrgSentimentTrend failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Return the empty pre-seeded buckets on error.
  }

  return Array.from(buckets.entries()).map(([date, counts]) => ({
    date,
    counts,
    total: ALL_LABELS.reduce((acc, l) => acc + counts[l], 0),
  }));
}

/**
 * Per-case sentiment timeline. Returns the most recent N labels in
 * chronological order (oldest first) so the overview card can render
 * a tiny sparkline-style strip.
 */
export type CaseSentimentPoint = {
  at: string;
  label: SentimentLabel;
  weight: number;
};

const LABEL_WEIGHT: Record<SentimentLabel, number> = {
  positive: 1,
  neutral: 0.6,
  confused: 0.4,
  frustrated: 0.2,
  angry: 0.05,
  churn_risk: 0,
};

export async function getCaseSentimentTimeline(
  caseId: string,
  daysBack = 30,
): Promise<CaseSentimentPoint[]> {
  await requireSession();
  const days = Math.max(1, Math.min(120, Math.floor(daysBack)));
  const cutoff = new Date(Date.now() - days * 86_400_000);

  try {
    const rows = await db.execute<{
      at: string;
      label: SentimentLabel;
    }>(sql`
      SELECT
        sentiment_analyzed_at AS at,
        sentiment_label::text AS label
      FROM communications
      WHERE case_id = ${caseId}
        AND sentiment_analyzed_at IS NOT NULL
        AND sentiment_label IS NOT NULL
        AND sentiment_analyzed_at >= ${cutoff.toISOString()}::timestamptz
      ORDER BY sentiment_analyzed_at ASC
      LIMIT 60
    `);

    return rows.map((r) => {
      const label = r.label as SentimentLabel;
      return {
        at: new Date(r.at).toISOString(),
        label,
        weight: LABEL_WEIGHT[label] ?? 0.5,
      };
    });
  } catch (err) {
    logger.error("getCaseSentimentTimeline failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
