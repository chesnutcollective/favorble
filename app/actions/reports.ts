"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  caseAssignments,
  calendarEvents,
  tasks,
  users,
  auditLog,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, count, lte, gte, isNull, desc, asc, sql } from "drizzle-orm";

export type DateRange = {
  start: Date;
  end: Date;
};

/**
 * Get cases grouped by stage for the funnel/bar chart.
 */
export async function getCasesByStageReport() {
  const session = await requireSession();

  const result = await db
    .select({
      stageId: caseStages.id,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      displayOrder: caseStages.displayOrder,
      groupDisplayOrder: caseStageGroups.displayOrder,
      caseCount: count(cases.id),
    })
    .from(caseStages)
    .leftJoin(
      cases,
      and(
        eq(cases.currentStageId, caseStages.id),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .innerJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .groupBy(
      caseStages.id,
      caseStages.name,
      caseStages.code,
      caseStages.displayOrder,
      caseStageGroups.name,
      caseStageGroups.color,
      caseStageGroups.displayOrder,
    )
    .orderBy(caseStageGroups.displayOrder, caseStages.displayOrder);

  return result;
}

/**
 * Get task completion rate stats.
 */
export async function getTaskCompletionStats() {
  const session = await requireSession();

  const [totalResult, completedResult, overdueResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          eq(tasks.status, "completed"),
          isNull(tasks.deletedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
          lte(tasks.dueDate, new Date()),
          sql`${tasks.status} NOT IN ('completed', 'skipped')`,
        ),
      ),
  ]);

  return {
    total: totalResult[0]?.count ?? 0,
    completed: completedResult[0]?.count ?? 0,
    overdue: overdueResult[0]?.count ?? 0,
  };
}

/**
 * Get a summary of case counts by status.
 */
export async function getCaseStatusSummary() {
  const session = await requireSession();

  const result = await db
    .select({
      status: cases.status,
      count: count(),
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .groupBy(cases.status);

  const summary: Record<string, number> = {};
  for (const row of result) {
    summary[row.status] = row.count;
  }

  return summary;
}

/**
 * Get the latest audit log entries for the dashboard activity feed.
 */
export async function getRecentAuditLog(limit = 10) {
  const session = await requireSession();

  const entries = await db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.organizationId, session.organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return entries;
}

/**
 * Get stage report filtered by case creation date range.
 */
export async function getCasesByStageReportFiltered(
  startDate: string | null,
  endDate: string | null,
) {
  const session = await requireSession();

  const caseConditions = [
    sql`${cases.currentStageId} = ${caseStages.id}`,
    eq(cases.status, "active"),
    isNull(cases.deletedAt),
  ];

  if (startDate) {
    caseConditions.push(gte(cases.createdAt, new Date(startDate)));
  }
  if (endDate) {
    // End of the day
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    caseConditions.push(lte(cases.createdAt, end));
  }

  const result = await db
    .select({
      stageId: caseStages.id,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      displayOrder: caseStages.displayOrder,
      groupDisplayOrder: caseStageGroups.displayOrder,
      caseCount: count(cases.id),
    })
    .from(caseStages)
    .leftJoin(cases, and(...caseConditions))
    .innerJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .groupBy(
      caseStages.id,
      caseStages.name,
      caseStages.code,
      caseStages.displayOrder,
      caseStageGroups.name,
      caseStageGroups.color,
      caseStageGroups.displayOrder,
    )
    .orderBy(caseStageGroups.displayOrder, caseStages.displayOrder);

  return result;
}

/**
 * Get task completion stats filtered by date range.
 */
export async function getTaskCompletionStatsFiltered(
  startDate: string | null,
  endDate: string | null,
) {
  const session = await requireSession();

  const baseConds = [
    eq(tasks.organizationId, session.organizationId),
    isNull(tasks.deletedAt),
  ];
  if (startDate) {
    baseConds.push(gte(tasks.createdAt, new Date(startDate)));
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    baseConds.push(lte(tasks.createdAt, end));
  }

  const [totalResult, completedResult, overdueResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(tasks)
      .where(and(...baseConds)),
    db
      .select({ count: count() })
      .from(tasks)
      .where(and(...baseConds, eq(tasks.status, "completed"))),
    db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          ...baseConds,
          lte(tasks.dueDate, new Date()),
          sql`${tasks.status} NOT IN ('completed', 'skipped')`,
        ),
      ),
  ]);

  return {
    total: totalResult[0]?.count ?? 0,
    completed: completedResult[0]?.count ?? 0,
    overdue: overdueResult[0]?.count ?? 0,
  };
}

/**
 * Server action for date range filtering from the client.
 */
export async function filterReportsByDateRange(
  startDate: string | null,
  endDate: string | null,
) {
  const [stageReport, taskStats] = await Promise.all([
    getCasesByStageReportFiltered(startDate, endDate),
    getTaskCompletionStatsFiltered(startDate, endDate),
  ]);

  return {
    stageReport: stageReport.map((r) => ({
      stageName: r.stageName,
      stageCode: r.stageCode,
      stageGroupName: r.stageGroupName,
      stageGroupColor: r.stageGroupColor,
      caseCount: r.caseCount,
    })),
    taskStats,
  };
}

/**
 * Get active case counts grouped by assigned team member.
 */
export async function getCasesByTeamMember() {
  const session = await requireSession();

  const result = await db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      caseCount: count(cases.id),
    })
    .from(caseAssignments)
    .innerJoin(users, eq(caseAssignments.userId, users.id))
    .innerJoin(
      cases,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .where(
      and(
        eq(users.organizationId, session.organizationId),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .groupBy(users.id, users.firstName, users.lastName)
    .orderBy(desc(count(cases.id)));

  return result.map((r) => ({
    userId: r.userId,
    name: `${r.firstName} ${r.lastName}`,
    caseCount: r.caseCount,
  }));
}

/**
 * Get average number of days cases spend in each stage,
 * computed from the caseStageTransitions table.
 *
 * For each "from" stage, the average duration is the mean of
 * (next transition timestamp - this transition timestamp).
 */
export async function getAverageTimeInStage() {
  const session = await requireSession();

  // Use a self-join on caseStageTransitions to compute durations.
  // For each transition row, find the next transition for the same case
  // (the one with the smallest transitionedAt that is greater).
  // We use a lateral sub-query via raw SQL for efficiency.
  const result = await db.execute<{
    stage_id: string;
    stage_name: string;
    stage_group_name: string;
    stage_group_color: string | null;
    avg_days: number;
    transition_count: number;
  }>(sql`
    WITH durations AS (
      SELECT
        t.to_stage_id AS stage_id,
        EXTRACT(EPOCH FROM (
          LEAD(t.transitioned_at) OVER (PARTITION BY t.case_id ORDER BY t.transitioned_at)
          - t.transitioned_at
        )) / 86400.0 AS days_in_stage
      FROM case_stage_transitions t
      INNER JOIN cases c ON c.id = t.case_id AND c.organization_id = ${session.organizationId}
      WHERE c.deleted_at IS NULL
    )
    SELECT
      cs.id AS stage_id,
      cs.name AS stage_name,
      csg.name AS stage_group_name,
      csg.color AS stage_group_color,
      COALESCE(ROUND(AVG(d.days_in_stage)::numeric, 1), 0) AS avg_days,
      COUNT(d.days_in_stage)::int AS transition_count
    FROM case_stages cs
    INNER JOIN case_stage_groups csg ON csg.id = cs.stage_group_id
    LEFT JOIN durations d ON d.stage_id = cs.id
    WHERE cs.organization_id = ${session.organizationId}
      AND cs.deleted_at IS NULL
    GROUP BY cs.id, cs.name, cs.display_order, csg.name, csg.color, csg.display_order
    ORDER BY csg.display_order, cs.display_order
  `);

  return result.map((r) => ({
    stageId: r.stage_id,
    stageName: r.stage_name,
    stageGroupName: r.stage_group_name,
    stageGroupColor: r.stage_group_color,
    avgDays: Number(r.avg_days),
    transitionCount: Number(r.transition_count),
  }));
}

/**
 * Get cases opened and closed over time, grouped by week or month.
 * Returns an array of { period, opened, closed } objects.
 */
export async function getCasesOverTime(
  dateFrom: string | null,
  dateTo: string | null,
  granularity: "week" | "month" = "month",
) {
  const session = await requireSession();

  // Build date range conditions
  const fromDate = dateFrom
    ? new Date(dateFrom)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const toDate = dateTo
    ? (() => {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : new Date();

  const interval =
    granularity === "week" ? sql`'1 week'::interval` : sql`'1 month'::interval`;
  const trunc = granularity === "week" ? sql`'week'` : sql`'month'`;

  const result = await db.execute<{
    period: string;
    opened: number;
    closed: number;
  }>(sql`
    WITH date_range AS (
      SELECT generate_series(
        date_trunc(${trunc}, ${fromDate}::timestamptz),
        date_trunc(${trunc}, ${toDate}::timestamptz),
        ${interval}
      ) AS period
    ),
    opened AS (
      SELECT
        date_trunc(${trunc}, created_at) AS period,
        COUNT(*)::int AS cnt
      FROM cases
      WHERE organization_id = ${session.organizationId}
        AND deleted_at IS NULL
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
      GROUP BY 1
    ),
    closed AS (
      SELECT
        date_trunc(${trunc}, closed_at) AS period,
        COUNT(*)::int AS cnt
      FROM cases
      WHERE organization_id = ${session.organizationId}
        AND deleted_at IS NULL
        AND closed_at IS NOT NULL
        AND closed_at >= ${fromDate}
        AND closed_at <= ${toDate}
      GROUP BY 1
    )
    SELECT
      dr.period::text AS period,
      COALESCE(o.cnt, 0)::int AS opened,
      COALESCE(c.cnt, 0)::int AS closed
    FROM date_range dr
    LEFT JOIN opened o ON o.period = dr.period
    LEFT JOIN closed c ON c.period = dr.period
    ORDER BY dr.period
  `);

  return result.map((r) => ({
    period: r.period,
    opened: Number(r.opened),
    closed: Number(r.closed),
  }));
}

/**
 * Get pipeline funnel data — case counts flowing through each stage group.
 * Groups active cases by their current stage group.
 */
export async function getPipelineFunnelData() {
  const session = await requireSession();

  const result = await db
    .select({
      stageGroupId: caseStageGroups.id,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      displayOrder: caseStageGroups.displayOrder,
      caseCount: count(cases.id),
    })
    .from(caseStageGroups)
    .leftJoin(
      caseStages,
      and(
        eq(caseStages.stageGroupId, caseStageGroups.id),
        isNull(caseStages.deletedAt),
      ),
    )
    .leftJoin(
      cases,
      and(
        eq(cases.currentStageId, caseStages.id),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .where(eq(caseStageGroups.organizationId, session.organizationId))
    .groupBy(
      caseStageGroups.id,
      caseStageGroups.name,
      caseStageGroups.color,
      caseStageGroups.displayOrder,
    )
    .orderBy(asc(caseStageGroups.displayOrder));

  return result.map((r) => ({
    name: r.stageGroupName,
    color: r.stageGroupColor,
    count: r.caseCount,
  }));
}

/**
 * Get upcoming calendar events (deadlines, hearings, etc.) for the dashboard widget.
 */
export async function getUpcomingDeadlines(limit = 5) {
  const session = await requireSession();

  const now = new Date();
  const events = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      caseId: calendarEvents.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
    .where(
      and(
        eq(calendarEvents.organizationId, session.organizationId),
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startAt, now),
      ),
    )
    .orderBy(asc(calendarEvents.startAt))
    .limit(limit);

  return events;
}

/**
 * Server action for filtering the detailed report views from the client.
 * Supports all four new report types plus the existing ones.
 */
export async function filterDetailedReport(
  reportType: string,
  startDate: string | null,
  endDate: string | null,
) {
  switch (reportType) {
    case "team-member":
      return { teamMember: await getCasesByTeamMember() };
    case "time-in-stage":
      return { timeInStage: await getAverageTimeInStage() };
    case "cases-over-time":
      return { casesOverTime: await getCasesOverTime(startDate, endDate) };
    case "pipeline-funnel":
      return { pipelineFunnel: await getPipelineFunnelData() };
    case "cases-by-stage":
      return {
        stageReport: (
          await getCasesByStageReportFiltered(startDate, endDate)
        ).map((r) => ({
          stageName: r.stageName,
          stageCode: r.stageCode,
          stageGroupName: r.stageGroupName,
          stageGroupColor: r.stageGroupColor,
          caseCount: r.caseCount,
        })),
      };
    case "task-completion":
      return {
        taskStats: await getTaskCompletionStatsFiltered(startDate, endDate),
      };
    default:
      return {};
  }
}
