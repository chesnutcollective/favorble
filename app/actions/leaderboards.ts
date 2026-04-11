"use server";

import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { performanceSnapshots } from "@/db/schema/performance";
import { requireSession } from "@/lib/auth/session";
import { and, eq, gte, lt, isNull, desc, asc, sql } from "drizzle-orm";
import {
  getRoleMetricPack,
  computeCompositeScore,
  evaluateMetric,
  type RoleMetricDefinition,
} from "@/lib/services/role-metrics";
import { computeDelta, classifyTrend } from "@/lib/services/pattern-analysis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = "day" | "week" | "month";

export type LeaderboardRow = {
  userId: string;
  name: string;
  email: string;
  value: number;
  rank: number;
  delta: number;
  deltaPercent: number | null;
  compositeScore: number;
};

export type CompositeLeaderboardRow = {
  userId: string;
  name: string;
  email: string;
  compositeScore: number;
  rank: number;
  metricCount: number;
};

export type UserMetricSnapshot = {
  metricKey: string;
  label: string;
  description: string;
  unit: RoleMetricDefinition["unit"];
  direction: RoleMetricDefinition["direction"];
  target: number;
  warn: number;
  critical: number;
  currentValue: number;
  priorValue: number;
  delta: number;
  deltaPercent: number | null;
  status: "healthy" | "warn" | "critical";
};

export type UserPerformance = {
  userId: string;
  name: string;
  email: string;
  role: string;
  compositeScore: number;
  metrics: UserMetricSnapshot[];
  periodStart: string;
};

export type UserTrendPoint = {
  periodStart: string;
  value: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Resolve the [start, end) window for a leaderboard period. We treat
 * the period as "last N days ending yesterday" to match how the rollup
 * populates the table.
 */
function resolvePeriodWindow(period: LeaderboardPeriod): {
  currentStart: Date;
  currentEnd: Date;
  priorStart: Date;
  priorEnd: Date;
} {
  const todayStart = startOfDayUTC(new Date());
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  const currentEnd = todayStart;
  const currentStart = new Date(
    currentEnd.getTime() - days * 86_400_000,
  );
  const priorEnd = currentStart;
  const priorStart = new Date(priorEnd.getTime() - days * 86_400_000);
  return { currentStart, currentEnd, priorStart, priorEnd };
}

async function getLatestSnapshotStart(
  orgId: string,
): Promise<Date | null> {
  const rows = await db
    .select({ maxStart: sql<string>`max(${performanceSnapshots.periodStart})` })
    .from(performanceSnapshots)
    .where(eq(performanceSnapshots.organizationId, orgId));
  const val = rows[0]?.maxStart;
  if (!val) return null;
  return new Date(val as string);
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

/**
 * Get users in a given role ordered by their latest value for a single
 * metric key. Deltas compare current period vs prior period average.
 */
export async function getLeaderboard(
  role: string,
  metricKey: string,
  period: LeaderboardPeriod = "day",
): Promise<LeaderboardRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const { currentStart, currentEnd, priorStart, priorEnd } =
    resolvePeriodWindow(period);

  const pack = getRoleMetricPack(role);
  const metric = pack.metrics.find((m) => m.metricKey === metricKey);
  if (!metric) return [];

  // Users in role
  const roleUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, orgId),
        sql`${users.role}::text = ${role}`,
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );

  if (roleUsers.length === 0) return [];

  // Current period avg per user
  const currentRows = await db
    .select({
      userId: performanceSnapshots.userId,
      value: sql<number>`AVG(${performanceSnapshots.value})::float`,
    })
    .from(performanceSnapshots)
    .where(
      and(
        eq(performanceSnapshots.organizationId, orgId),
        eq(performanceSnapshots.metricKey, metricKey),
        gte(performanceSnapshots.periodStart, currentStart),
        lt(performanceSnapshots.periodStart, currentEnd),
      ),
    )
    .groupBy(performanceSnapshots.userId);

  const priorRows = await db
    .select({
      userId: performanceSnapshots.userId,
      value: sql<number>`AVG(${performanceSnapshots.value})::float`,
    })
    .from(performanceSnapshots)
    .where(
      and(
        eq(performanceSnapshots.organizationId, orgId),
        eq(performanceSnapshots.metricKey, metricKey),
        gte(performanceSnapshots.periodStart, priorStart),
        lt(performanceSnapshots.periodStart, priorEnd),
      ),
    )
    .groupBy(performanceSnapshots.userId);

  // Composite scores — grab latest snapshot per metric per user
  const compositeByUser = await getCompositeScoresForUsers(
    orgId,
    roleUsers.map((u) => u.id),
    role,
  );

  const currentMap = new Map(
    currentRows.map((r) => [r.userId, Number(r.value)]),
  );
  const priorMap = new Map(priorRows.map((r) => [r.userId, Number(r.value)]));

  const rows: LeaderboardRow[] = roleUsers.map((u) => {
    const current = currentMap.get(u.id) ?? 0;
    const prior = priorMap.get(u.id) ?? 0;
    const { delta, deltaPercent } = computeDelta(current, prior);
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      value: Math.round(current * 100) / 100,
      rank: 0,
      delta: Math.round(delta * 100) / 100,
      deltaPercent,
      compositeScore: compositeByUser.get(u.id) ?? 0,
    };
  });

  // Sort by value according to metric direction, then assign rank
  rows.sort((a, b) =>
    metric.direction === "higher_is_better"
      ? b.value - a.value
      : a.value - b.value,
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return rows;
}

/**
 * Composite leaderboard — rank users across their full role metric
 * pack by their weighted composite score.
 */
export async function getCompositeLeaderboard(
  role: string,
  _period: LeaderboardPeriod = "day",
): Promise<CompositeLeaderboardRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const roleUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, orgId),
        sql`${users.role}::text = ${role}`,
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );

  if (roleUsers.length === 0) return [];

  const compositeMap = await getCompositeScoresForUsers(
    orgId,
    roleUsers.map((u) => u.id),
    role,
  );
  const metricCountMap = await getMetricCountsForUsers(
    orgId,
    roleUsers.map((u) => u.id),
  );

  const rows: CompositeLeaderboardRow[] = roleUsers.map((u) => ({
    userId: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    compositeScore: compositeMap.get(u.id) ?? 0,
    metricCount: metricCountMap.get(u.id) ?? 0,
    rank: 0,
  }));

  rows.sort((a, b) => b.compositeScore - a.compositeScore);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return rows;
}

// Helper: for each user, fetch most recent value per metric and
// compute composite score.
async function getCompositeScoresForUsers(
  orgId: string,
  userIds: string[],
  role: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;

  // For each user × metricKey, grab the latest value. We use
  // DISTINCT ON to keep it single-query.
  const rows = await db.execute<{
    user_id: string;
    metric_key: string;
    value: string;
  }>(sql`
    SELECT DISTINCT ON (user_id, metric_key)
      user_id, metric_key, value::text AS value
    FROM performance_snapshots
    WHERE organization_id = ${orgId}
      AND user_id IN (${sql.join(
        userIds.map((u) => sql`${u}::uuid`),
        sql`, `,
      )})
    ORDER BY user_id, metric_key, period_start DESC
  `);

  const byUser = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const existing = byUser.get(r.user_id) ?? {};
    existing[r.metric_key] = Number(r.value);
    byUser.set(r.user_id, existing);
  }

  for (const uid of userIds) {
    const values = byUser.get(uid) ?? {};
    out.set(uid, computeCompositeScore(role, values));
  }

  return out;
}

async function getMetricCountsForUsers(
  orgId: string,
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const rows = await db.execute<{ user_id: string; n: number }>(sql`
    SELECT user_id, COUNT(DISTINCT metric_key)::int AS n
    FROM performance_snapshots
    WHERE organization_id = ${orgId}
      AND user_id IN (${sql.join(
        userIds.map((u) => sql`${u}::uuid`),
        sql`, `,
      )})
    GROUP BY user_id
  `);
  for (const r of rows) out.set(r.user_id, Number(r.n));
  return out;
}

// ---------------------------------------------------------------------------
// User detail
// ---------------------------------------------------------------------------

/**
 * All metrics for one user — current value, target, deltas, composite.
 */
export async function getUserPerformance(
  userId: string,
  _period: LeaderboardPeriod = "day",
): Promise<UserPerformance | null> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organizationId, orgId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (userRows.length === 0) return null;
  const u = userRows[0];
  const pack = getRoleMetricPack(u.role);

  // Latest period start in snapshots for this user
  const latestStart = await getLatestSnapshotStart(orgId);
  const periodStart = latestStart ?? startOfDayUTC(new Date());
  const priorStart = new Date(periodStart.getTime() - 7 * 86_400_000);

  // Most recent value per metric for user
  const latestRows = await db.execute<{
    metric_key: string;
    value: string;
  }>(sql`
    SELECT DISTINCT ON (metric_key)
      metric_key, value::text AS value
    FROM performance_snapshots
    WHERE organization_id = ${orgId}
      AND user_id = ${userId}::uuid
    ORDER BY metric_key, period_start DESC
  `);
  const latestMap = new Map<string, number>(
    latestRows.map((r) => [r.metric_key, Number(r.value)]),
  );

  // Prior snapshot (7 days before latest)
  const priorRows = await db.execute<{
    metric_key: string;
    value: string;
  }>(sql`
    SELECT DISTINCT ON (metric_key)
      metric_key, value::text AS value
    FROM performance_snapshots
    WHERE organization_id = ${orgId}
      AND user_id = ${userId}::uuid
      AND period_start <= ${priorStart}
    ORDER BY metric_key, period_start DESC
  `);
  const priorMap = new Map<string, number>(
    priorRows.map((r) => [r.metric_key, Number(r.value)]),
  );

  const metrics: UserMetricSnapshot[] = pack.metrics.map((m) => {
    const current = latestMap.get(m.metricKey) ?? 0;
    const prior = priorMap.get(m.metricKey) ?? 0;
    const { delta, deltaPercent } = computeDelta(current, prior);
    const breach = evaluateMetric(m, current);
    const status: "healthy" | "warn" | "critical" =
      breach === null ? "healthy" : breach;
    return {
      metricKey: m.metricKey,
      label: m.label,
      description: m.description,
      unit: m.unit,
      direction: m.direction,
      target: m.targetValue,
      warn: m.warnThreshold,
      critical: m.criticalThreshold,
      currentValue: Math.round(current * 100) / 100,
      priorValue: Math.round(prior * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      deltaPercent,
      status,
    };
  });

  const values: Record<string, number> = {};
  for (const m of metrics) values[m.metricKey] = m.currentValue;
  const compositeScore = computeCompositeScore(u.role, values);

  return {
    userId: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    role: u.role,
    compositeScore,
    metrics,
    periodStart: periodStart.toISOString(),
  };
}

/**
 * Return a time series of values for a single user × metric over the
 * past `daysBack` days — feeds the sparkline / trend chart.
 */
export async function getUserTrend(
  userId: string,
  metricKey: string,
  daysBack = 30,
): Promise<{ points: UserTrendPoint[]; trend: "improving" | "declining" | "stable" }> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const cutoff = new Date(
    startOfDayUTC(new Date()).getTime() - daysBack * 86_400_000,
  );

  const rows = await db
    .select({
      periodStart: performanceSnapshots.periodStart,
      value: performanceSnapshots.value,
    })
    .from(performanceSnapshots)
    .where(
      and(
        eq(performanceSnapshots.organizationId, orgId),
        eq(performanceSnapshots.userId, userId),
        eq(performanceSnapshots.metricKey, metricKey),
        gte(performanceSnapshots.periodStart, cutoff),
      ),
    )
    .orderBy(asc(performanceSnapshots.periodStart));

  const points: UserTrendPoint[] = rows.map((r) => ({
    periodStart:
      r.periodStart instanceof Date
        ? r.periodStart.toISOString()
        : new Date(r.periodStart).toISOString(),
    value: Number(r.value),
  }));

  // Direction from role pack
  const userRow = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = userRow[0]?.role ?? "";
  const pack = getRoleMetricPack(role);
  const metric = pack.metrics.find((m) => m.metricKey === metricKey);
  const direction = metric?.direction ?? "higher_is_better";

  const trend = classifyTrend(
    points.map((p) => p.value),
    direction,
  );

  return { points, trend };
}

/**
 * Convenience: list of all users with their composite score. Powers
 * the team-performance index page.
 */
export async function getAllUsersPerformance(): Promise<
  Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    team: string | null;
    compositeScore: number;
  }>
> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const allUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      team: users.team,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, orgId),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(desc(users.role));

  if (allUsers.length === 0) return [];

  // For each user, fetch their latest metric values and composite
  const rows = await db.execute<{
    user_id: string;
    role: string;
    metric_key: string;
    value: string;
  }>(sql`
    SELECT DISTINCT ON (user_id, metric_key)
      user_id, role, metric_key, value::text AS value
    FROM performance_snapshots
    WHERE organization_id = ${orgId}
    ORDER BY user_id, metric_key, period_start DESC
  `);

  const byUser = new Map<string, { role: string; values: Record<string, number> }>();
  for (const r of rows) {
    const existing = byUser.get(r.user_id) ?? { role: r.role, values: {} };
    existing.values[r.metric_key] = Number(r.value);
    byUser.set(r.user_id, existing);
  }

  return allUsers.map((u) => {
    const data = byUser.get(u.id);
    const composite = data
      ? computeCompositeScore(data.role, data.values)
      : 0;
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      role: u.role,
      team: u.team,
      compositeScore: composite,
    };
  });
}
