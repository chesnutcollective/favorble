import "server-only";

/**
 * Workload imbalance detector (SM-4).
 *
 * Pulls live open-task counts per user within a role and classifies
 * each user as overloaded, underutilized, or within the normal band
 * using the z-score primitive from `pattern-analysis`. Also produces
 * a list of reassignment suggestions the supervisor UI can render
 * with "Apply" buttons.
 *
 * Kept as a service (not an action) so it can be called from cron jobs
 * or server components without forcing a client round-trip. The
 * supervisor workload page imports it directly.
 */

import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { tasks, users } from "@/db/schema";

// The `role` column is a pg enum; drizzle narrows its allowed value
// types, but at the service boundary we accept any string because the
// caller passes a role slug from configuration. Cast with a typed
// helper to satisfy the compiler without leaking `any`.
type UserRole = (typeof users.role.enumValues)[number];
import { findOutliers } from "@/lib/services/pattern-analysis";
import { logger } from "@/lib/logger/server";

export type ImbalanceUser = {
  userId: string;
  name: string;
  load: number;
  zScore: number;
};

export type ImbalanceReport = {
  role: string;
  sampleSize: number;
  mean: number;
  overloaded: ImbalanceUser[];
  underutilized: ImbalanceUser[];
};

export type ReassignmentSuggestion = {
  taskId: string;
  taskTitle: string;
  dueDate: string | null;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  rationale: string;
};

const Z_THRESHOLD = 1.25;

/**
 * Detect workload imbalance within a role. Returns an empty report
 * when fewer than 3 users exist for the role (stats are meaningless
 * with tiny samples).
 */
export async function detectImbalance(
  organizationId: string,
  role: string,
): Promise<ImbalanceReport> {
  try {
    const userRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.role, role as UserRole),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    if (userRows.length < 3) {
      return {
        role,
        sampleSize: userRows.length,
        mean: 0,
        overloaded: [],
        underutilized: [],
      };
    }

    const userIds = userRows.map((u) => u.id);

    const loadRows = await db
      .select({
        userId: tasks.assignedToId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          isNull(tasks.deletedAt),
          inArray(tasks.status, ["pending", "in_progress"]),
          inArray(tasks.assignedToId, userIds),
        ),
      )
      .groupBy(tasks.assignedToId);

    const loadByUser = new Map<string, number>();
    for (const row of loadRows) {
      if (row.userId) loadByUser.set(row.userId, Number(row.n ?? 0));
    }

    const nameById = new Map<string, string>();
    for (const u of userRows) {
      nameById.set(
        u.id,
        `${u.firstName} ${u.lastName}`.trim() || u.email,
      );
    }

    const labeled = userRows.map((u) => ({
      label: u.id,
      value: loadByUser.get(u.id) ?? 0,
    }));
    const outliers = findOutliers(labeled, Z_THRESHOLD);
    const mean =
      labeled.reduce((acc, v) => acc + v.value, 0) / labeled.length;

    const overloaded: ImbalanceUser[] = [];
    const underutilized: ImbalanceUser[] = [];
    for (const o of outliers) {
      const bucket = o.kind === "high" ? overloaded : underutilized;
      bucket.push({
        userId: o.label,
        name: nameById.get(o.label) ?? o.label,
        load: o.value,
        zScore: Math.round(o.zScore * 100) / 100,
      });
    }

    return {
      role,
      sampleSize: userRows.length,
      mean: Math.round(mean * 10) / 10,
      overloaded,
      underutilized,
    };
  } catch (error) {
    logger.error("detectImbalance failed", { role, error });
    return { role, sampleSize: 0, mean: 0, overloaded: [], underutilized: [] };
  }
}

/**
 * Recommend concrete reassignments for a role. For each overloaded
 * user the detector pulls their single most-overdue open task and
 * pairs it with the least-loaded underutilized user. Returns an empty
 * list when no imbalance exists or when there's no target user.
 */
export async function recommendReassignments(
  organizationId: string,
  role: string,
): Promise<ReassignmentSuggestion[]> {
  const report = await detectImbalance(organizationId, role);
  if (report.overloaded.length === 0 || report.underutilized.length === 0) {
    return [];
  }

  // Sort underutilized ascending by load so the lowest-loaded goes first.
  const targets = [...report.underutilized].sort((a, b) => a.load - b.load);
  const suggestions: ReassignmentSuggestion[] = [];

  try {
    const now = new Date();

    // Pre-compute overdue counts for all users involved so we can
    // generate meaningful rationale strings without N+1 queries.
    const allUserIds = [
      ...report.overloaded.map((u) => u.userId),
      ...report.underutilized.map((u) => u.userId),
    ];
    const overdueRows = allUserIds.length > 0
      ? await db
          .select({
            userId: tasks.assignedToId,
            n: sql<number>`count(*)::int`,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.organizationId, organizationId),
              isNull(tasks.deletedAt),
              inArray(tasks.status, ["pending", "in_progress"]),
              inArray(tasks.assignedToId, allUserIds),
              lt(tasks.dueDate, now),
            ),
          )
          .groupBy(tasks.assignedToId)
      : [];
    const overdueByUser = new Map<string, number>();
    for (const row of overdueRows) {
      if (row.userId) overdueByUser.set(row.userId, Number(row.n ?? 0));
    }

    for (const over of report.overloaded) {
      // Pick the next target in round-robin fashion to avoid dumping
      // everything on a single underutilized user.
      const target = targets.shift();
      if (!target) break;
      // Put the target at the back of the queue so the next suggestion
      // rotates to the next underutilized user.
      targets.push(target);

      const [candidate] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, organizationId),
            eq(tasks.assignedToId, over.userId),
            isNull(tasks.deletedAt),
            inArray(tasks.status, ["pending", "in_progress"]),
            lt(tasks.dueDate, now),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(1);

      if (!candidate) continue;

      const fromOverdue = overdueByUser.get(over.userId) ?? 0;
      const toOverdue = overdueByUser.get(target.userId) ?? 0;

      const rationale = `Move "${candidate.title}" from ${over.name} (${over.load} open tasks, ${fromOverdue} overdue) to ${target.name} (${target.load} open tasks, ${toOverdue} overdue). This balances the ${role} team's workload.`;

      suggestions.push({
        taskId: candidate.id,
        taskTitle: candidate.title,
        dueDate:
          candidate.dueDate instanceof Date
            ? candidate.dueDate.toISOString()
            : null,
        fromUserId: over.userId,
        fromUserName: over.name,
        toUserId: target.userId,
        toUserName: target.name,
        reason: `${over.name} is carrying ${over.load} open tasks (z=${over.zScore}); ${target.name} has ${target.load}.`,
        rationale,
      });
    }
  } catch (error) {
    logger.error("recommendReassignments failed", { role, error });
  }

  return suggestions;
}
