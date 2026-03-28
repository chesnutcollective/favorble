"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  tasks,
  auditLog,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, count, lte, gte, isNull, desc, sql } from "drizzle-orm";

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
    .leftJoin(cases, and(
      eq(cases.currentStageId, caseStages.id),
      eq(cases.status, "active"),
      isNull(cases.deletedAt),
    ))
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
    .innerJoin(
      caseStageGroups,
      eq(caseStages.stageGroupId, caseStageGroups.id),
    )
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
