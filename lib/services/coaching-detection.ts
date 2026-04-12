import "server-only";
import { db } from "@/db/drizzle";
import {
  coachingFlags,
  trainingGaps,
  performanceSnapshots,
  users,
} from "@/db/schema";
import { and, eq, gte, desc, isNull, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  ROLE_METRICS,
  evaluateMetric,
  getRoleMetricPack,
  type RoleMetricDefinition,
} from "@/lib/services/role-metrics";
import { findOutliers } from "@/lib/services/pattern-analysis";
import { createNotification } from "@/lib/services/notify";
import { getRecipe } from "@/lib/services/coaching-library";

/**
 * Coaching flag + training gap detection (CC-1, CC-3).
 *
 * Runs daily via the `/api/cron/coaching-scan` route. For each active
 * user in the firm, pulls the most recent 7 days of
 * `performanceSnapshots` rows, picks the latest value for every metric
 * defined in their role pack, evaluates it against the warn/critical
 * thresholds, and raises a `coachingFlags` row if the user has 2+
 * critical metrics.
 *
 * Training gaps roll the same data up at the role level — if half the
 * team is below the warn threshold for a given metric, we emit a
 * `trainingGaps` row so leadership can schedule broader training rather
 * than one-on-one coaching.
 */

const LOOKBACK_DAYS = 7;
const CRITICAL_FLAG_THRESHOLD = 2; // need ≥ N critical-band metrics
const TRAINING_GAP_RATIO = 0.5; // 50% of the team below warn

/**
 * Shape of the action step persisted to `coaching_flags.suggested_action_steps`.
 */
type StoredActionStep = {
  label: string;
  description: string | null;
  expectedOutcome?: string | null;
  timeframe?: string | null;
  dueDate: string | null;
};

/**
 * Fallback used only when the coaching library has no recipe for a
 * given (role, metric) pair. Real recipes live in
 * `lib/services/coaching-library.ts`.
 */
const GENERIC_ACTION_STEPS: StoredActionStep[] = [
  {
    label: "Schedule a 30-minute coaching conversation with the supervisor",
    description:
      "Open calendar and book time with the supervisor in the next 2 business days. Bring the flagged metric and last week of activity.",
    expectedOutcome: "A shared plan for the week ahead",
    timeframe: "Within 2 business days",
    dueDate: null,
  },
  {
    label: "Review the last week of work and identify the top blocker",
    description:
      "Before the coaching conversation, spend 15 minutes writing down the single biggest thing in the way of hitting target this week.",
    expectedOutcome: "A concrete blocker the supervisor can help remove",
    timeframe: "Before the coaching session",
    dueDate: null,
  },
  {
    label: "Agree on a measurable improvement goal for next week",
    description:
      "Leave the coaching conversation with a specific, measurable target for the next 7 days — not a general intention.",
    expectedOutcome:
      "Everyone knows what 'improved' looks like by next Friday",
    timeframe: "End of coaching session",
    dueDate: null,
  },
];

type MetricEvaluation = {
  metric: RoleMetricDefinition;
  value: number;
  status: "warn" | "critical";
};

type UserRow = {
  id: string;
  organizationId: string;
  role: string;
  firstName: string;
  lastName: string;
};

/**
 * Look up a supervisor for a given user.
 *
 * We don't have a direct supervisor mapping — we fall back to the first
 * `admin` in the same organization. Good enough for MVP; real routing
 * can layer a team lookup in later without touching the detection call
 * site.
 */
async function resolveSupervisorId(
  organizationId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.role, "admin"),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  } catch (err) {
    logger.warn("coaching: resolveSupervisorId failed", {
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Find any open (or in_progress) coaching flag for this subject + metric
 * so the daily sweep doesn't fire a duplicate.
 */
async function hasOpenFlag(
  subjectUserId: string,
  metricKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: coachingFlags.id })
    .from(coachingFlags)
    .where(
      and(
        eq(coachingFlags.subjectUserId, subjectUserId),
        eq(coachingFlags.metricKey, metricKey),
        inArray(coachingFlags.status, ["open", "in_progress"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Pull the recipe-driven action steps for (role, metricKey). Falls back
 * to a generic 3-step checklist only if no recipe is registered.
 */
function getActionSteps(role: string, metricKey: string): StoredActionStep[] {
  const recipe = getRecipe(role, metricKey);
  if (!recipe) return GENERIC_ACTION_STEPS;
  return recipe.actionSteps.map((step) => ({
    label: step.label,
    description: step.description,
    expectedOutcome: step.expectedOutcome,
    timeframe: step.timeframe,
    dueDate: null,
  }));
}

/**
 * Pull the most recent 7 days of performance snapshots for every active
 * user and reduce them to a map keyed by userId → metricKey → latest
 * numeric value.
 */
async function loadLatestValuesByUser(
  cutoff: Date,
): Promise<
  Map<
    string,
    {
      user: UserRow;
      values: Map<string, number>;
    }
  >
> {
  const userRows = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.isActive, true), isNull(users.deletedAt)));

  const result = new Map<
    string,
    { user: UserRow; values: Map<string, number> }
  >();

  for (const u of userRows) {
    result.set(u.id, {
      user: {
        id: u.id,
        organizationId: u.organizationId,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
      },
      values: new Map<string, number>(),
    });
  }

  const snapshotRows = await db
    .select({
      userId: performanceSnapshots.userId,
      metricKey: performanceSnapshots.metricKey,
      value: performanceSnapshots.value,
      periodStart: performanceSnapshots.periodStart,
    })
    .from(performanceSnapshots)
    .where(gte(performanceSnapshots.periodStart, cutoff))
    .orderBy(desc(performanceSnapshots.periodStart));

  // First row per (userId, metricKey) wins because we sorted desc on periodStart.
  const seen = new Set<string>();
  for (const row of snapshotRows) {
    const key = `${row.userId}::${row.metricKey}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket = result.get(row.userId);
    if (!bucket) continue; // inactive/unknown user — skip
    const numeric = Number(row.value);
    if (!Number.isFinite(numeric)) continue;
    bucket.values.set(row.metricKey, numeric);
  }

  return result;
}

export type DetectCoachingFlagsResult = {
  usersScanned: number;
  flagsInserted: number;
  flagsSkipped: number;
};

/**
 * CC-1. Scan every user's latest performance snapshots and open a
 * coaching flag for anyone sitting at 2+ critical-band metrics.
 */
export async function detectCoachingFlags(): Promise<DetectCoachingFlagsResult> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const userMap = await loadLatestValuesByUser(cutoff);

  // Build role → userId → compositeValue map for outlier detection.
  // We score each user on a per-metric basis: for each critical metric,
  // we'll check whether this user is an outlier within their role.
  const roleLatestByMetric: Map<
    string,
    Map<string, Array<{ label: string; value: number }>>
  > = new Map();

  for (const { user, values } of userMap.values()) {
    let perRole = roleLatestByMetric.get(user.role);
    if (!perRole) {
      perRole = new Map();
      roleLatestByMetric.set(user.role, perRole);
    }
    for (const [metricKey, value] of values) {
      const arr = perRole.get(metricKey) ?? [];
      arr.push({ label: user.id, value });
      perRole.set(metricKey, arr);
    }
  }

  let flagsInserted = 0;
  let flagsSkipped = 0;
  let usersScanned = 0;

  for (const { user, values } of userMap.values()) {
    const pack = getRoleMetricPack(user.role);
    if (pack.metrics.length === 0) continue;
    usersScanned++;

    const evaluations: MetricEvaluation[] = [];
    for (const metric of pack.metrics) {
      const value = values.get(metric.metricKey);
      if (value === undefined) continue;
      const status = evaluateMetric(metric, value);
      if (status) {
        evaluations.push({ metric, value, status });
      }
    }

    const criticals = evaluations.filter((e) => e.status === "critical");
    if (criticals.length < CRITICAL_FLAG_THRESHOLD) continue;

    // Severity: start from the number of criticals, bump by warns.
    const warns = evaluations.filter((e) => e.status === "warn").length;
    const rawSeverity = criticals.length * 2 + warns;
    const severity = Math.min(10, Math.max(1, rawSeverity));

    // Build the flag — one per *primary* critical metric. We pick the
    // metric with the highest weight as the canonical one for the flag
    // row so the supervisor sees the most important issue first.
    const primary = criticals.reduce((a, b) =>
      b.metric.weight > a.metric.weight ? b : a,
    );

    // Dedupe — skip if there's already an open flag on this metric.
    if (await hasOpenFlag(user.id, primary.metric.metricKey)) {
      flagsSkipped++;
      continue;
    }

    // Classification — outlier within the role = people problem; else process.
    const perRole = roleLatestByMetric.get(user.role);
    const roleData = perRole?.get(primary.metric.metricKey) ?? [];
    let classification: "people" | "process" | "unclear" = "unclear";
    if (roleData.length >= 3) {
      const outliers = findOutliers(roleData);
      const isOutlier = outliers.some((o) => o.label === user.id);
      classification = isOutlier ? "people" : "process";
    } else {
      // Not enough peers to tell — leave unclear, default toward process
      classification = "process";
    }

    const supervisorUserId = await resolveSupervisorId(user.organizationId);
    const actionSteps = getActionSteps(user.role, primary.metric.metricKey);
    const recipe = getRecipe(user.role, primary.metric.metricKey);

    // Preferred summary: recipe diagnosis (specific, reads well in UI).
    // Fallback: the old role-label rollup for metric pairs that don't
    // have a recipe yet.
    const summary = recipe
      ? `${user.firstName} ${user.lastName} — ${primary.metric.label}: ${recipe.diagnosis}`
      : `${user.firstName} ${user.lastName} is in the critical band on ${criticals.length} ${pack.label} metric${criticals.length === 1 ? "" : "s"} (${criticals.map((c) => c.metric.label).join(", ")})`;

    try {
      const [inserted] = await db
        .insert(coachingFlags)
        .values({
          organizationId: user.organizationId,
          subjectUserId: user.id,
          supervisorUserId: supervisorUserId ?? null,
          role: user.role,
          metricKey: primary.metric.metricKey,
          severity,
          status: "open",
          summary,
          suggestedActionSteps: actionSteps,
          classification,
        })
        .returning({ id: coachingFlags.id });

      flagsInserted++;

      // Notify the supervisor if one is assignable.
      if (supervisorUserId && inserted) {
        await createNotification({
          organizationId: user.organizationId,
          userId: supervisorUserId,
          title: `Coaching flag raised: ${user.firstName} ${user.lastName}`,
          body: summary,
          priority: severity >= 7 ? "high" : "normal",
          actionLabel: "Review flag",
          actionHref: `/coaching/${inserted.id}`,
          dedupeKey: `coaching_flag_${inserted.id}`,
        });
      }
    } catch (err) {
      logger.error("coaching: failed to insert flag", {
        userId: user.id,
        metric: primary.metric.metricKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { usersScanned, flagsInserted, flagsSkipped };
}

export type DetectTrainingGapsResult = {
  rolesScanned: number;
  gapsInserted: number;
};

/**
 * CC-3. For each role pack, for each metric, compute how many of the
 * role's users are below warn. If ≥ TRAINING_GAP_RATIO of the team is
 * below warn, insert a training gap row so leadership can plan
 * role-wide training.
 */
export async function detectTrainingGaps(): Promise<DetectTrainingGapsResult> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const userMap = await loadLatestValuesByUser(cutoff);

  // Bucket users by (role, metricKey) → values.
  type RoleBucket = {
    organizationId: string;
    users: Array<{
      userId: string;
      values: Map<string, number>;
    }>;
  };
  const roleBuckets = new Map<string, RoleBucket>();

  for (const { user, values } of userMap.values()) {
    let bucket = roleBuckets.get(user.role);
    if (!bucket) {
      bucket = { organizationId: user.organizationId, users: [] };
      roleBuckets.set(user.role, bucket);
    }
    bucket.users.push({ userId: user.id, values });
  }

  let rolesScanned = 0;
  let gapsInserted = 0;

  for (const [role, pack] of Object.entries(ROLE_METRICS)) {
    const bucket = roleBuckets.get(role);
    if (!bucket || bucket.users.length === 0) continue;
    rolesScanned++;

    for (const metric of pack.metrics) {
      const usersWithMetric = bucket.users.filter((u) =>
        u.values.has(metric.metricKey),
      );
      if (usersWithMetric.length === 0) continue;

      let belowWarn = 0;
      for (const u of usersWithMetric) {
        const value = u.values.get(metric.metricKey)!;
        const status = evaluateMetric(metric, value);
        if (status === "warn" || status === "critical") belowWarn++;
      }

      const ratio = belowWarn / usersWithMetric.length;
      if (ratio < TRAINING_GAP_RATIO) continue;

      const pluralRole = `${pack.label.toLowerCase()}s`;
      const summary = `${belowWarn} of ${usersWithMetric.length} ${pluralRole} are below target for ${metric.label}`;

      // Recipe-driven recommendation: point leadership at the specific
      // training resources the library has catalogued for this metric,
      // formatted as a numbered list. Fall back to a generic sentence if
      // the library doesn't have a recipe for this (role, metric) pair.
      const recipe = getRecipe(role, metric.metricKey);
      const urgencyHint =
        ratio >= 0.75
          ? "This is affecting most of the team — prioritize a live workshop."
          : "Cover the top 3 failure modes and re-measure in 2 weeks.";
      let recommendation: string;
      if (recipe && recipe.trainingResources.length > 0) {
        const numbered = recipe.trainingResources
          .map((resource, i) => `${i + 1}. ${resource}`)
          .join("\n");
        const rootCauses =
          recipe.commonRootCauses.length > 0
            ? `\n\nCommon root causes:\n${recipe.commonRootCauses
                .map((c) => `- ${c}`)
                .join("\n")}`
            : "";
        recommendation = `Schedule a role-wide training on ${metric.label}. ${urgencyHint}\n\nRecommended resources:\n${numbered}${rootCauses}`;
      } else {
        recommendation = `Schedule a role-wide training on ${metric.label}. ${urgencyHint}`;
      }

      try {
        await db.insert(trainingGaps).values({
          organizationId: bucket.organizationId,
          role,
          metricKey: metric.metricKey,
          affectedUserCount: belowWarn,
          totalUserCount: usersWithMetric.length,
          summary,
          recommendation,
        });
        gapsInserted++;
      } catch (err) {
        logger.error("coaching: failed to insert training gap", {
          role,
          metric: metric.metricKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { rolesScanned, gapsInserted };
}
