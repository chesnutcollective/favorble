import "server-only";
import { db } from "@/db/drizzle";
import { integrationEvents } from "@/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

// ─── Types ───

export type HourlyBucket = {
  hour: number;
  count: number;
  errors: number;
};

export type IntegrationUsage24h = {
  totalEvents: number;
  okCount: number;
  warnCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uptimePercent: number;
  hourlyBreakdown: HourlyBucket[];
};

export type IntegrationUsageSummaryItem = {
  integrationId: string;
  totalEvents24h: number;
  errorCount24h: number;
  avgLatencyMs: number;
  lastEventAt: string | null;
  status: "ok" | "warn" | "error" | "inactive";
};

export type WebhookDeliveryStats = {
  total24h: number;
  success24h: number;
  failed24h: number;
  avgLatencyMs: number;
  topEventTypes: Array<{ type: string; count: number }>;
};

// ─── Helpers ───

function hours24Ago(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// ─── Functions ───

/**
 * Per-integration usage metrics for the last 24 hours.
 * Feeds the detail page stats card and sparkline.
 */
export async function getIntegrationUsage24h(
  integrationId: string,
): Promise<IntegrationUsage24h> {
  const since = hours24Ago();

  try {
    // Aggregate counts + avg latency in one query
    const [agg] = await db
      .select({
        totalEvents: sql<number>`count(*)::int`,
        okCount: sql<number>`count(*) filter (where ${integrationEvents.status} = 'ok')::int`,
        warnCount: sql<number>`count(*) filter (where ${integrationEvents.status} = 'warn')::int`,
        errorCount: sql<number>`count(*) filter (where ${integrationEvents.status} = 'error' or ${integrationEvents.status} = 'timeout')::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${integrationEvents.latencyMs})::int, 0)`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          gte(integrationEvents.createdAt, since),
        ),
      );

    const totalEvents = agg?.totalEvents ?? 0;
    const okCount = agg?.okCount ?? 0;
    const warnCount = agg?.warnCount ?? 0;
    const errorCount = agg?.errorCount ?? 0;
    const avgLatencyMs = agg?.avgLatencyMs ?? 0;

    // p95 latency
    const [p95Row] = await db
      .select({
        p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${integrationEvents.latencyMs})::int, 0)`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          gte(integrationEvents.createdAt, since),
          sql`${integrationEvents.latencyMs} is not null`,
        ),
      );

    const p95LatencyMs = p95Row?.p95 ?? 0;
    const uptimePercent =
      totalEvents > 0 ? Math.round((okCount / totalEvents) * 10000) / 100 : 100;

    // Hourly breakdown — 24 buckets
    const hourlyRows = await db
      .select({
        hour: sql<number>`extract(hour from ${integrationEvents.createdAt})::int`,
        count: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${integrationEvents.status} = 'error' or ${integrationEvents.status} = 'timeout')::int`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          gte(integrationEvents.createdAt, since),
        ),
      )
      .groupBy(sql`extract(hour from ${integrationEvents.createdAt})`);

    // Fill all 24 hours
    const hourMap = new Map(hourlyRows.map((r) => [r.hour, r]));
    const hourlyBreakdown: HourlyBucket[] = [];
    for (let h = 0; h < 24; h++) {
      const row = hourMap.get(h);
      hourlyBreakdown.push({
        hour: h,
        count: row?.count ?? 0,
        errors: row?.errors ?? 0,
      });
    }

    return {
      totalEvents,
      okCount,
      warnCount,
      errorCount,
      avgLatencyMs,
      p95LatencyMs,
      uptimePercent,
      hourlyBreakdown,
    };
  } catch (err) {
    logger.error("getIntegrationUsage24h failed", {
      integrationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      totalEvents: 0,
      okCount: 0,
      warnCount: 0,
      errorCount: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      uptimePercent: 100,
      hourlyBreakdown: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: 0,
        errors: 0,
      })),
    };
  }
}

/**
 * Summary row for every integration that has events in the last 24 hours.
 * Used by the cockpit grid cards and summary bar.
 */
export async function getIntegrationUsageSummary(): Promise<
  IntegrationUsageSummaryItem[]
> {
  const since = hours24Ago();

  try {
    const rows = await db
      .select({
        integrationId: integrationEvents.integrationId,
        totalEvents24h: sql<number>`count(*)::int`,
        errorCount24h: sql<number>`count(*) filter (where ${integrationEvents.status} = 'error' or ${integrationEvents.status} = 'timeout')::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${integrationEvents.latencyMs})::int, 0)`,
        lastEventAt: sql<string>`max(${integrationEvents.createdAt})::text`,
      })
      .from(integrationEvents)
      .where(gte(integrationEvents.createdAt, since))
      .groupBy(integrationEvents.integrationId);

    return rows.map((r) => {
      const errorRate =
        r.totalEvents24h > 0 ? r.errorCount24h / r.totalEvents24h : 0;
      let status: IntegrationUsageSummaryItem["status"] = "ok";
      if (r.totalEvents24h === 0) status = "inactive";
      else if (errorRate > 0.5) status = "error";
      else if (errorRate > 0.1) status = "warn";

      return {
        integrationId: r.integrationId,
        totalEvents24h: r.totalEvents24h,
        errorCount24h: r.errorCount24h,
        avgLatencyMs: r.avgLatencyMs,
        lastEventAt: r.lastEventAt,
        status,
      };
    });
  } catch (err) {
    logger.error("getIntegrationUsageSummary failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Webhook-specific delivery stats for an integration.
 */
export async function getWebhookDeliveryStats(
  integrationId: string,
): Promise<WebhookDeliveryStats> {
  const since = hours24Ago();

  try {
    const [agg] = await db
      .select({
        total24h: sql<number>`count(*)::int`,
        success24h: sql<number>`count(*) filter (where ${integrationEvents.status} = 'ok')::int`,
        failed24h: sql<number>`count(*) filter (where ${integrationEvents.status} = 'error' or ${integrationEvents.status} = 'timeout')::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${integrationEvents.latencyMs})::int, 0)`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          eq(integrationEvents.eventType, "webhook_received"),
          gte(integrationEvents.createdAt, since),
        ),
      );

    const topEventTypes = await db
      .select({
        type: integrationEvents.webhookEventType,
        count: sql<number>`count(*)::int`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          eq(integrationEvents.eventType, "webhook_received"),
          gte(integrationEvents.createdAt, since),
          sql`${integrationEvents.webhookEventType} is not null`,
        ),
      )
      .groupBy(integrationEvents.webhookEventType)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      total24h: agg?.total24h ?? 0,
      success24h: agg?.success24h ?? 0,
      failed24h: agg?.failed24h ?? 0,
      avgLatencyMs: agg?.avgLatencyMs ?? 0,
      topEventTypes: topEventTypes.map((r) => ({
        type: r.type ?? "unknown",
        count: r.count,
      })),
    };
  } catch (err) {
    logger.error("getWebhookDeliveryStats failed", {
      integrationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      total24h: 0,
      success24h: 0,
      failed24h: 0,
      avgLatencyMs: 0,
      topEventTypes: [],
    };
  }
}

/**
 * Sparkline data — array of event counts per hour for the last N hours.
 * Returns `hours` data points, oldest first.
 */
export async function getIntegrationSparklineData(
  integrationId: string,
  hours = 24,
): Promise<number[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const rows = await db
      .select({
        bucket: sql<string>`date_trunc('hour', ${integrationEvents.createdAt})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.integrationId, integrationId),
          gte(integrationEvents.createdAt, since),
        ),
      )
      .groupBy(sql`date_trunc('hour', ${integrationEvents.createdAt})`)
      .orderBy(sql`date_trunc('hour', ${integrationEvents.createdAt})`);

    // Build a map of bucket -> count, then fill every hour
    const bucketMap = new Map<string, number>();
    for (const r of rows) {
      bucketMap.set(r.bucket, r.count);
    }

    const result: number[] = [];
    const now = new Date();
    for (let i = hours - 1; i >= 0; i--) {
      const bucketDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      bucketDate.setMinutes(0, 0, 0);
      const key = bucketDate.toISOString().replace("T", " ").replace("Z", "+00");
      result.push(bucketMap.get(key) ?? 0);
    }

    return result;
  } catch (err) {
    logger.error("getIntegrationSparklineData failed", {
      integrationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return Array(hours).fill(0);
  }
}
