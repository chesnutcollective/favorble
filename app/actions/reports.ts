"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  tasks,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, count, lte, isNull, sql } from "drizzle-orm";

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
