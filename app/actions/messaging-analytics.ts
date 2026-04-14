"use server";

import { db } from "@/db/drizzle";
import { communications, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, gte, isNull, sql } from "drizzle-orm";

// B7 — Messaging analytics
// ---------------------------------------------------------------------------
// Period semantics: identical to /reports/leaderboards — "day" = today,
// "week" = last 7 days, "month" = last 30 days. Windows are [start, now).
// All queries are org-scoped and use the communications table directly so
// "today" data is live, no nightly rollup dependency.

export type AnalyticsPeriod = "day" | "week" | "month";

export type MessagingTiles = {
  totalInbound: number;
  totalOutbound: number;
  automatedCount: number;
  automatedPercent: number; // 0-100
  avgResponseMinutes: number; // 0 if no responses
};

export type DailyTimeSeriesPoint = {
  /** ISO date yyyy-mm-dd for the bucket start (UTC). */
  date: string;
  inbound: number;
  outbound: number;
  automated: number;
};

export type PerUserMessagingRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  outboundCount: number;
  automatedCount: number;
  automatedPercent: number; // 0-100 of this user's outbound
  avgResponseMinutes: number;
  responseCount: number;
  // Value-add adoption (V2, stubbed to 0 until tracked)
  documentShares: number;
  appointmentsCreated: number;
  automationsTriggered: number;
};

export type MessagingAnalytics = {
  period: AnalyticsPeriod;
  periodStart: string;
  periodEnd: string;
  tiles: MessagingTiles;
  timeSeries: DailyTimeSeriesPoint[];
  perUser: PerUserMessagingRow[];
};

function periodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  const start = new Date(now);
  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function emptyAnalytics(period: AnalyticsPeriod): MessagingAnalytics {
  const start = periodStart(period);
  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: new Date().toISOString(),
    tiles: {
      totalInbound: 0,
      totalOutbound: 0,
      automatedCount: 0,
      automatedPercent: 0,
      avgResponseMinutes: 0,
    },
    timeSeries: [],
    perUser: [],
  };
}

/**
 * Build the day-by-day time series for the last 30 days, joining the
 * three stream counts (inbound, outbound, automated) per day. Always
 * returns 30 entries so the chart has a stable x-axis.
 */
function buildEmptyTimeSeries(daysBack = 30): DailyTimeSeriesPoint[] {
  const out: DailyTimeSeriesPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      inbound: 0,
      outbound: 0,
      automated: 0,
    });
  }
  return out;
}

/**
 * Messaging analytics for the reports dashboard. Always returns a
 * well-formed shape — graceful empty defaults on DB errors.
 */
export async function getMessagingAnalytics(
  period: AnalyticsPeriod = "week",
): Promise<MessagingAnalytics> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const since = periodStart(period);

  try {
    // Tiles: single aggregated query
    const tileRows = await db
      .select({
        totalInbound: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'inbound')::int`,
        totalOutbound: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound')::int`,
        automated: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound' AND ${communications.isAutomated} = true)::int`,
        avgSeconds: sql<
          number | null
        >`AVG(${communications.responseTimeSeconds}) FILTER (WHERE ${communications.responseTimeSeconds} IS NOT NULL)`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, orgId),
          gte(communications.createdAt, since),
        ),
      );

    const tileRow = tileRows[0] ?? {
      totalInbound: 0,
      totalOutbound: 0,
      automated: 0,
      avgSeconds: 0,
    };

    const totalInbound = Number(tileRow.totalInbound ?? 0);
    const totalOutbound = Number(tileRow.totalOutbound ?? 0);
    const automatedCount = Number(tileRow.automated ?? 0);
    const avgSeconds = Number(tileRow.avgSeconds ?? 0);
    const automatedPercent =
      totalOutbound > 0
        ? Math.round((automatedCount / totalOutbound) * 100)
        : 0;
    const avgResponseMinutes =
      avgSeconds > 0 ? Math.round((avgSeconds / 60) * 10) / 10 : 0;

    // Time series — always last 30 days regardless of period selector.
    // A 30-day rolling window gives the chart consistent shape while the
    // tiles / per-user table respect the `period` selection.
    const tsStart = new Date();
    tsStart.setUTCHours(0, 0, 0, 0);
    tsStart.setUTCDate(tsStart.getUTCDate() - 29);

    const tsRows = await db
      .select({
        day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${communications.createdAt}), 'YYYY-MM-DD')`,
        inbound: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'inbound')::int`,
        outbound: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound' AND COALESCE(${communications.isAutomated}, false) = false)::int`,
        automated: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound' AND ${communications.isAutomated} = true)::int`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, orgId),
          gte(communications.createdAt, tsStart),
        ),
      )
      .groupBy(sql`DATE_TRUNC('day', ${communications.createdAt})`);

    const timeSeries = buildEmptyTimeSeries(30);
    const tsByDay = new Map<
      string,
      { inbound: number; outbound: number; automated: number }
    >();
    for (const row of tsRows) {
      tsByDay.set(String(row.day), {
        inbound: Number(row.inbound ?? 0),
        outbound: Number(row.outbound ?? 0),
        automated: Number(row.automated ?? 0),
      });
    }
    for (const point of timeSeries) {
      const data = tsByDay.get(point.date);
      if (data) {
        point.inbound = data.inbound;
        point.outbound = data.outbound;
        point.automated = data.automated;
      }
    }

    // Per-user table — one query gets outbound + automated per user within
    // the selected period. Response times come from a separate aggregation
    // on `responded_by`.
    const outboundRows = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        outboundCount: sql<number>`COUNT(*)::int`,
        automatedCount: sql<number>`COUNT(*) FILTER (WHERE COALESCE(${communications.isAutomated}, false) = true)::int`,
      })
      .from(users)
      .innerJoin(
        communications,
        eq(communications.userId, users.id),
      )
      .where(
        and(
          eq(users.organizationId, orgId),
          isNull(users.deletedAt),
          eq(communications.organizationId, orgId),
          eq(communications.direction, "outbound"),
          gte(communications.createdAt, since),
        ),
      )
      .groupBy(
        users.id,
        users.firstName,
        users.lastName,
        users.email,
        users.role,
      );

    const responseRows = await db.execute<{
      user_id: string;
      avg_seconds: number | null;
      response_count: number;
    }>(sql`
      SELECT
        responded_by AS user_id,
        AVG(response_time_seconds)::int AS avg_seconds,
        COUNT(*)::int AS response_count
      FROM communications
      WHERE organization_id = ${orgId}
        AND responded_at IS NOT NULL
        AND response_time_seconds IS NOT NULL
        AND responded_at >= ${since}
        AND responded_by IS NOT NULL
      GROUP BY responded_by
    `);

    const resolvedResponses = responseRows as unknown as Array<{
      user_id: string;
      avg_seconds: number | null;
      response_count: number;
    }>;

    const responseByUser = new Map<
      string,
      { avgMinutes: number; count: number }
    >();
    for (const r of resolvedResponses) {
      const secs = Number(r.avg_seconds ?? 0);
      responseByUser.set(r.user_id, {
        avgMinutes: secs > 0 ? Math.round((secs / 60) * 10) / 10 : 0,
        count: Number(r.response_count ?? 0),
      });
    }

    const perUser: PerUserMessagingRow[] = outboundRows.map((r) => {
      const outbound = Number(r.outboundCount ?? 0);
      const automated = Number(r.automatedCount ?? 0);
      const resp = responseByUser.get(r.userId) ?? {
        avgMinutes: 0,
        count: 0,
      };
      const fullName =
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
      return {
        userId: r.userId,
        name: fullName,
        email: r.email,
        role: r.role,
        outboundCount: outbound,
        automatedCount: automated,
        automatedPercent:
          outbound > 0 ? Math.round((automated / outbound) * 100) : 0,
        avgResponseMinutes: resp.avgMinutes,
        responseCount: resp.count,
        // V2 stubs — not yet tracked at the row level.
        documentShares: 0,
        appointmentsCreated: 0,
        automationsTriggered: 0,
      };
    });

    perUser.sort((a, b) => b.outboundCount - a.outboundCount);

    return {
      period,
      periodStart: since.toISOString(),
      periodEnd: new Date().toISOString(),
      tiles: {
        totalInbound,
        totalOutbound,
        automatedCount,
        automatedPercent,
        avgResponseMinutes,
      },
      timeSeries,
      perUser,
    };
  } catch (err) {
    console.warn("[messaging-analytics] query failed", err);
    return emptyAnalytics(period);
  }
}
