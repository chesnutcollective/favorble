import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import {
  performanceSnapshots,
  teamPerformanceSnapshots,
} from "@/db/schema/performance";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  collectAllMetricsForUser,
  type CollectorUser,
} from "@/lib/services/metric-collectors";

/**
 * Nightly performance rollup cron.
 *
 * For each active user in the org:
 *   1. Compute the closed "yesterday UTC" window [00:00Z, next 00:00Z)
 *   2. Run every collector in their role metric pack
 *   3. Upsert one row per metric into performance_snapshots
 *
 * Then for each team, aggregate user-level metrics into
 * team_performance_snapshots (mean across active members).
 *
 * Scheduled daily at 02:00 UTC via vercel.json.
 * Authenticated via CRON_SECRET header.
 *
 * Runtime cap: 3 minutes. Individual user failures are logged but don't
 * break the whole run.
 */

const MAX_RUNTIME_MS = 3 * 60 * 1000;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

/** Start of the day UTC for the given date. */
function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** [yesterdayStart, todayStart) in UTC — a full closed day. */
function computeYesterdayWindow(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const todayStart = startOfDayUTC(now);
  const periodStart = new Date(todayStart.getTime() - 86_400_000);
  const periodEnd = todayStart;
  return { periodStart, periodEnd };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron performance-rollup unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { periodStart, periodEnd } = computeYesterdayWindow();

  return await runPerformanceRollup({
    periodStart,
    periodEnd,
    startedAt: Date.now(),
  });
}

export type RollupStats = {
  usersProcessed: number;
  teamsProcessed: number;
  metricsWritten: number;
  errors: Array<{ userId?: string; team?: string; error: string }>;
};

/**
 * Core rollup entrypoint — exported so the seed script can call it
 * directly without an HTTP round trip.
 */
export async function runPerformanceRollup(opts: {
  periodStart: Date;
  periodEnd: Date;
  startedAt?: number;
}): Promise<NextResponse<RollupStats & { success: boolean }>> {
  const startedAt = opts.startedAt ?? Date.now();
  const { periodStart, periodEnd } = opts;

  const errors: RollupStats["errors"] = [];
  let usersProcessed = 0;
  let teamsProcessed = 0;
  let metricsWritten = 0;

  let allUsers: Array<{
    id: string;
    organizationId: string;
    role: string;
    team: string | null;
  }> = [];

  try {
    allUsers = await db
      .select({
        id: users.id,
        organizationId: users.organizationId,
        role: users.role,
        team: users.team,
      })
      .from(users)
      .where(and(eq(users.isActive, true), isNull(users.deletedAt)));
  } catch (err) {
    logger.error("performance-rollup: failed to list users", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      success: false,
      usersProcessed: 0,
      teamsProcessed: 0,
      metricsWritten: 0,
      errors: [{ error: err instanceof Error ? err.message : String(err) }],
    });
  }

  logger.info("performance-rollup starting", {
    userCount: allUsers.length,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  // Keep per-team accumulators in memory so we can roll up without a
  // second pass over the DB. Key: `${orgId}|${team}|${metricKey}`
  type TeamAccum = {
    organizationId: string;
    team: string;
    metricKey: string;
    total: number;
    count: number;
  };
  const teamAccum = new Map<string, TeamAccum>();

  for (const user of allUsers) {
    if (Date.now() - startedAt > MAX_RUNTIME_MS) {
      errors.push({ error: "runtime cap reached" });
      break;
    }

    const collectorUser: CollectorUser = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      team: user.team,
    };

    try {
      const collected = await collectAllMetricsForUser(
        collectorUser,
        periodStart,
        periodEnd,
      );

      // Upsert each metric row
      for (const metric of Object.values(collected)) {
        await db
          .insert(performanceSnapshots)
          .values({
            organizationId: user.organizationId,
            userId: user.id,
            role: user.role,
            periodStart,
            metricKey: metric.metricKey,
            value: metric.value.toString(),
            context: metric.context ?? null,
          })
          .onConflictDoUpdate({
            target: [
              performanceSnapshots.userId,
              performanceSnapshots.metricKey,
              performanceSnapshots.periodStart,
            ],
            set: {
              value: metric.value.toString(),
              context: metric.context ?? null,
              role: user.role,
            },
          });

        metricsWritten++;

        // Accumulate team totals
        if (user.team) {
          const key = `${user.organizationId}|${user.team}|${metric.metricKey}`;
          const existing = teamAccum.get(key);
          if (existing) {
            existing.total += metric.value;
            existing.count += 1;
          } else {
            teamAccum.set(key, {
              organizationId: user.organizationId,
              team: user.team,
              metricKey: metric.metricKey,
              total: metric.value,
              count: 1,
            });
          }
        }
      }

      usersProcessed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("performance-rollup: user failed", {
        userId: user.id,
        error: msg,
      });
      errors.push({ userId: user.id, error: msg });
    }
  }

  // Team rollups
  const seenTeams = new Set<string>();
  for (const accum of teamAccum.values()) {
    try {
      const mean = accum.count > 0 ? accum.total / accum.count : 0;
      await db
        .insert(teamPerformanceSnapshots)
        .values({
          organizationId: accum.organizationId,
          team: accum.team,
          periodStart,
          metricKey: accum.metricKey,
          value: mean.toString(),
          memberCount: accum.count,
          context: { total: accum.total, mean },
        })
        .onConflictDoUpdate({
          target: [
            teamPerformanceSnapshots.team,
            teamPerformanceSnapshots.metricKey,
            teamPerformanceSnapshots.periodStart,
          ],
          set: {
            value: mean.toString(),
            memberCount: accum.count,
            context: { total: accum.total, mean },
          },
        });
      seenTeams.add(accum.team);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("performance-rollup: team rollup failed", {
        team: accum.team,
        error: msg,
      });
      errors.push({ team: accum.team, error: msg });
    }
  }
  teamsProcessed = seenTeams.size;

  const result = {
    success: true,
    usersProcessed,
    teamsProcessed,
    metricsWritten,
    errors,
  };

  logger.info("performance-rollup complete", {
    usersProcessed,
    teamsProcessed,
    metricsWritten,
    errorCount: errors.length,
    elapsedMs: Date.now() - startedAt,
  });

  return NextResponse.json(result);
}
