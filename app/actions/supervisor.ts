"use server";

import { db } from "@/db/drizzle";
import { supervisorEvents, tasks, users, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Supervisor overview workspace server actions.
 *
 * Backs the `/supervisor` page with:
 *  - Team workload distribution (tasks per user)
 *  - Escalation queue (tasks with escalation_state != 'none')
 *  - Supervisor event feed with status buckets
 *  - Performance summary cards
 */

// ─── Workload ──────────────────────────────────────────────

export type WorkloadRow = {
  userId: string;
  userName: string;
  role: string;
  team: string | null;
  pendingTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  totalOpen: number;
};

export async function getTeamWorkload(): Promise<WorkloadRow[]> {
  const session = await requireSession();

  try {
    // Get all active users in the org
    const orgUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        team: users.team,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, session.organizationId),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      )
      .limit(200);

    const now = new Date();

    const results: WorkloadRow[] = [];

    for (const u of orgUsers) {
      // Get task counts per user in a single query
      const taskRows = await db
        .select({
          status: tasks.status,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, session.organizationId),
            eq(tasks.assignedToId, u.id),
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1000);

      let pending = 0;
      let inProgress = 0;
      let overdue = 0;

      for (const t of taskRows) {
        if (
          t.status === "pending" ||
          t.status === "blocked" ||
          t.status === "pending_client_confirmation"
        ) {
          pending++;
        } else if (t.status === "in_progress") {
          inProgress++;
        }

        // Count overdue: open tasks with dueDate in the past
        if (
          t.dueDate &&
          new Date(t.dueDate) < now &&
          t.status !== "completed" &&
          t.status !== "skipped"
        ) {
          overdue++;
        }
      }

      const totalOpen = pending + inProgress;

      // Only include users who have at least one open task
      if (totalOpen > 0 || overdue > 0) {
        results.push({
          userId: u.id,
          userName: `${u.firstName} ${u.lastName}`,
          role: u.role,
          team: u.team,
          pendingTasks: pending,
          inProgressTasks: inProgress,
          overdueTasks: overdue,
          totalOpen,
        });
      }
    }

    // Sort by total open tasks descending
    results.sort((a, b) => b.totalOpen - a.totalOpen);
    return results;
  } catch (err) {
    logger.error("getTeamWorkload failed", { error: err });
    return [];
  }
}

// ─── Escalation Queue ──────────────────────────────────────

export type EscalationRow = {
  taskId: string;
  taskTitle: string;
  caseId: string;
  caseNumber: string;
  assignedUserName: string | null;
  escalationState: string;
  dueDate: string | null;
  daysOverdue: number;
  priority: string;
};

export async function getEscalationQueue(): Promise<EscalationRow[]> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        taskId: tasks.id,
        taskTitle: tasks.title,
        caseId: tasks.caseId,
        caseNumber: cases.caseNumber,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        escalationState: tasks.escalationState,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
      })
      .from(tasks)
      .leftJoin(cases, eq(tasks.caseId, cases.id))
      .leftJoin(users, eq(tasks.assignedToId, users.id))
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          ne(tasks.escalationState, "none"),
          isNull(tasks.deletedAt),
          ne(tasks.status, "completed"),
          ne(tasks.status, "skipped"),
        ),
      )
      .orderBy(desc(tasks.lastEscalatedAt))
      .limit(200);

    const now = Date.now();

    return rows.map((r) => {
      const daysOverdue = r.dueDate
        ? Math.max(
            0,
            Math.floor((now - new Date(r.dueDate).getTime()) / 86_400_000),
          )
        : 0;

      return {
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        assignedUserName:
          r.assignedFirstName || r.assignedLastName
            ? `${r.assignedFirstName ?? ""} ${r.assignedLastName ?? ""}`.trim()
            : null,
        escalationState: r.escalationState,
        dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
        daysOverdue,
        priority: r.priority,
      };
    });
  } catch (err) {
    logger.error("getEscalationQueue failed", { error: err });
    return [];
  }
}

// ─── Supervisor Events ─────────────────────────────────────

export type SupervisorEventRow = {
  id: string;
  eventType: string;
  status: string;
  summary: string;
  caseId: string | null;
  caseNumber: string | null;
  assignedUserName: string | null;
  recommendedAction: string | null;
  detectedAt: string;
};

export type SupervisorEventWorkspace = {
  active: SupervisorEventRow[];
  resolved: SupervisorEventRow[];
  counts: {
    detected: number;
    inProgress: number;
    awaitingReview: number;
    resolved: number;
  };
};

export async function getSupervisorEvents(): Promise<SupervisorEventWorkspace> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: supervisorEvents.id,
        eventType: supervisorEvents.eventType,
        status: supervisorEvents.status,
        summary: supervisorEvents.summary,
        caseId: supervisorEvents.caseId,
        caseNumber: cases.caseNumber,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        recommendedAction: supervisorEvents.recommendedAction,
        detectedAt: supervisorEvents.detectedAt,
      })
      .from(supervisorEvents)
      .leftJoin(cases, eq(supervisorEvents.caseId, cases.id))
      .leftJoin(users, eq(supervisorEvents.assignedUserId, users.id))
      .where(eq(supervisorEvents.organizationId, session.organizationId))
      .orderBy(desc(supervisorEvents.detectedAt))
      .limit(500);

    const active: SupervisorEventRow[] = [];
    const resolved: SupervisorEventRow[] = [];
    let detected = 0;
    let inProgress = 0;
    let awaitingReview = 0;
    let resolvedCount = 0;

    for (const r of rows) {
      const row: SupervisorEventRow = {
        id: r.id,
        eventType: r.eventType,
        status: r.status,
        summary: r.summary,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? null,
        assignedUserName:
          r.assignedFirstName || r.assignedLastName
            ? `${r.assignedFirstName ?? ""} ${r.assignedLastName ?? ""}`.trim()
            : null,
        recommendedAction: r.recommendedAction,
        detectedAt: r.detectedAt.toISOString(),
      };

      switch (r.status) {
        case "detected":
          detected++;
          active.push(row);
          break;
        case "file_updated":
        case "draft_created":
        case "task_assigned":
          inProgress++;
          active.push(row);
          break;
        case "awaiting_review":
          awaitingReview++;
          active.push(row);
          break;
        case "resolved":
        case "dismissed":
          resolvedCount++;
          resolved.push(row);
          break;
        default:
          active.push(row);
      }
    }

    return {
      active,
      resolved,
      counts: {
        detected,
        inProgress,
        awaitingReview,
        resolved: resolvedCount,
      },
    };
  } catch (err) {
    logger.error("getSupervisorEvents failed", { error: err });
    return {
      active: [],
      resolved: [],
      counts: {
        detected: 0,
        inProgress: 0,
        awaitingReview: 0,
        resolved: 0,
      },
    };
  }
}

// ─── Performance Summary ───────────────────────────────────

export type PerformanceSummary = {
  totalActiveCases: number;
  totalOpenTasks: number;
  totalOverdueTasks: number;
  totalEscalations: number;
  totalActiveEvents: number;
  avgTasksPerUser: number;
};

export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  const session = await requireSession();

  try {
    const [caseCount] = await db
      .select({ count: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      );

    const [taskCount] = await db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          ne(tasks.status, "completed"),
          ne(tasks.status, "skipped"),
        ),
      );

    const [overdueCount] = await db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          ne(tasks.status, "completed"),
          ne(tasks.status, "skipped"),
          sql`${tasks.dueDate} < now()`,
        ),
      );

    const [escalationCount] = await db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          ne(tasks.escalationState, "none"),
          ne(tasks.status, "completed"),
          ne(tasks.status, "skipped"),
        ),
      );

    const [eventCount] = await db
      .select({ count: count() })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.organizationId, session.organizationId),
          ne(supervisorEvents.status, "resolved"),
          ne(supervisorEvents.status, "dismissed"),
        ),
      );

    const [activeUserCount] = await db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          eq(users.organizationId, session.organizationId),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    const totalOpenTasks = taskCount?.count ?? 0;
    const userCount = activeUserCount?.count ?? 1;
    const avgTasksPerUser =
      userCount > 0 ? Math.round((totalOpenTasks / userCount) * 10) / 10 : 0;

    return {
      totalActiveCases: caseCount?.count ?? 0,
      totalOpenTasks,
      totalOverdueTasks: overdueCount?.count ?? 0,
      totalEscalations: escalationCount?.count ?? 0,
      totalActiveEvents: eventCount?.count ?? 0,
      avgTasksPerUser,
    };
  } catch (err) {
    logger.error("getPerformanceSummary failed", { error: err });
    return {
      totalActiveCases: 0,
      totalOpenTasks: 0,
      totalOverdueTasks: 0,
      totalEscalations: 0,
      totalActiveEvents: 0,
      avgTasksPerUser: 0,
    };
  }
}
