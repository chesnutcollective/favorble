"use server";

/**
 * Cross-staff workload matrix actions (SM-1).
 *
 * Returns one row per active user in the org with live counts of open
 * tasks, overdue tasks, active cases and last activity timestamp. Used
 * by the supervisor hub to spot bottleneck people at a glance.
 *
 * Data access is gated to admin + reviewer roles. Non-privileged
 * callers receive an empty result rather than a hard error so the page
 * degrades gracefully when mis-linked.
 */

import { and, eq, gt, inArray, isNull, lt, max, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { caseAssignments, cases, tasks, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

export type WorkloadRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  openTaskCount: number;
  overdueTaskCount: number;
  activeCaseCount: number;
  lastActivity: string | null;
};

const SUPERVISOR_ROLES = new Set(["admin", "reviewer"]);

function canViewWorkload(role: string): boolean {
  return SUPERVISOR_ROLES.has(role);
}

/**
 * Build a workload matrix for every active user in the caller's
 * organization. Returns `[]` for non-privileged callers.
 */
export async function getWorkloadMatrix(): Promise<WorkloadRow[]> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return [];

  try {
    const userRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        team: users.team,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, session.organizationId),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    if (userRows.length === 0) return [];

    const userIds = userRows.map((u) => u.id);
    const now = new Date();

    // Open tasks per user (pending + in_progress)
    const openTaskRows = await db
      .select({
        userId: tasks.assignedToId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          inArray(tasks.status, ["pending", "in_progress"]),
          inArray(tasks.assignedToId, userIds),
        ),
      )
      .groupBy(tasks.assignedToId);
    const openTaskByUser = new Map<string, number>();
    for (const r of openTaskRows) {
      if (r.userId) openTaskByUser.set(r.userId, Number(r.n ?? 0));
    }

    // Overdue tasks per user (open + past-due)
    const overdueRows = await db
      .select({
        userId: tasks.assignedToId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          inArray(tasks.status, ["pending", "in_progress"]),
          inArray(tasks.assignedToId, userIds),
          lt(tasks.dueDate, now),
        ),
      )
      .groupBy(tasks.assignedToId);
    const overdueByUser = new Map<string, number>();
    for (const r of overdueRows) {
      if (r.userId) overdueByUser.set(r.userId, Number(r.n ?? 0));
    }

    // Active case count per user via caseAssignments join
    const caseRows = await db
      .select({
        userId: caseAssignments.userId,
        n: sql<number>`count(distinct ${cases.id})::int`,
      })
      .from(caseAssignments)
      .innerJoin(cases, eq(caseAssignments.caseId, cases.id))
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          isNull(caseAssignments.unassignedAt),
          inArray(caseAssignments.userId, userIds),
        ),
      )
      .groupBy(caseAssignments.userId);
    const activeCaseByUser = new Map<string, number>();
    for (const r of caseRows) {
      if (r.userId) activeCaseByUser.set(r.userId, Number(r.n ?? 0));
    }

    // Last activity: latest task.updatedAt owned by the user (as a
    // cheap proxy). Fall back to user.lastLoginAt when no tasks.
    const activityRows = await db
      .select({
        userId: tasks.assignedToId,
        latest: max(tasks.updatedAt),
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          inArray(tasks.assignedToId, userIds),
        ),
      )
      .groupBy(tasks.assignedToId);
    const activityByUser = new Map<string, string | null>();
    for (const r of activityRows) {
      if (r.userId) {
        activityByUser.set(
          r.userId,
          r.latest instanceof Date ? r.latest.toISOString() : null,
        );
      }
    }

    return userRows
      .map<WorkloadRow>((u) => ({
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`.trim() || u.email,
        email: u.email,
        role: u.role,
        team: u.team ?? null,
        openTaskCount: openTaskByUser.get(u.id) ?? 0,
        overdueTaskCount: overdueByUser.get(u.id) ?? 0,
        activeCaseCount: activeCaseByUser.get(u.id) ?? 0,
        lastActivity:
          activityByUser.get(u.id) ??
          (u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : null),
      }))
      .sort((a, b) => b.overdueTaskCount - a.overdueTaskCount);
  } catch (error) {
    logger.error("Failed to build workload matrix", { error });
    return [];
  }
}

/**
 * Count of open supervisor events in the org — used for the
 * supervisor hub summary card. Gated the same as the matrix itself.
 */
export async function getOpenSupervisorEventCount(): Promise<number> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return 0;
  try {
    const { supervisorEvents } = await import("@/db/schema");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.organizationId, session.organizationId),
          inArray(supervisorEvents.status, [
            "detected",
            "file_updated",
            "draft_created",
            "task_assigned",
            "awaiting_review",
          ]),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (error) {
    logger.error("Failed to count supervisor events", { error });
    return 0;
  }
}

/**
 * Count of open coaching flags across the org.
 */
export async function getOpenCoachingFlagCount(): Promise<number> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return 0;
  try {
    const { coachingFlags } = await import("@/db/schema");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(coachingFlags)
      .where(
        and(
          eq(coachingFlags.organizationId, session.organizationId),
          inArray(coachingFlags.status, ["open", "in_progress"]),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (error) {
    logger.error("Failed to count coaching flags", { error });
    return 0;
  }
}

/**
 * Count of open compliance findings.
 */
export async function getOpenComplianceFindingCount(): Promise<number> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return 0;
  try {
    const { complianceFindings } = await import("@/db/schema");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(complianceFindings)
      .where(
        and(
          eq(complianceFindings.organizationId, session.organizationId),
          inArray(complianceFindings.status, ["open", "acknowledged"]),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (error) {
    logger.error("Failed to count compliance findings", { error });
    return 0;
  }
}

/**
 * Count of cases currently scored in the "high" or "critical" risk
 * band — feeds the supervisor-hub risk card.
 */
export async function getHighRiskCaseCount(): Promise<number> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return 0;
  try {
    const { caseRiskScores } = await import("@/db/schema");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(caseRiskScores)
      .where(
        and(
          eq(caseRiskScores.organizationId, session.organizationId),
          inArray(caseRiskScores.riskBand, ["high", "critical"]),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (error) {
    logger.error("Failed to count high-risk cases", { error });
    return 0;
  }
}

/**
 * Count of AI drafts waiting on supervisor/reviewer action.
 */
export async function getOpenDraftCount(): Promise<number> {
  const session = await requireSession();
  if (!canViewWorkload(session.role)) return 0;
  try {
    const { aiDrafts } = await import("@/db/schema");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiDrafts)
      .where(
        and(
          eq(aiDrafts.organizationId, session.organizationId),
          inArray(aiDrafts.status, ["draft_ready", "in_review"]),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (error) {
    logger.error("Failed to count AI drafts", { error });
    return 0;
  }
}

// Silence the unused import warning — `gt` is kept for future "recent
// activity" filters that may extend this module.
void gt;
