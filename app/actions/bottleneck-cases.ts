"use server";

import { db } from "@/db/drizzle";
import { requireSession } from "@/lib/auth/session";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BottleneckCase = {
  caseId: string;
  caseNumber: string;
  dwellDays: number;
  assigneeName: string | null;
  overdueTaskCount: number;
  lastActivityDate: string | null;
};

// ---------------------------------------------------------------------------
// getCasesAtStage
// ---------------------------------------------------------------------------

/**
 * Returns the cases currently sitting at the given stage, along with
 * their dwell time, current assignee, overdue task count, and last
 * activity date. Used by the bottleneck drill-through (PR-3).
 */
export async function getCasesAtStage(
  stageId: string,
): Promise<BottleneckCase[]> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const now = new Date();

  const rows = await db.execute<{
    case_id: string;
    case_number: string;
    dwell_days: number;
    assignee_name: string | null;
    overdue_task_count: number;
    last_activity_date: string | null;
  }>(sql`
    SELECT
      c.id AS case_id,
      c.case_number,
      COALESCE(
        EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - c.stage_entered_at)) / 86400,
        0
      )::float AS dwell_days,
      CASE
        WHEN u.first_name IS NOT NULL THEN CONCAT(u.first_name, ' ', u.last_name)
        ELSE NULL
      END AS assignee_name,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM tasks t
         WHERE t.case_id = c.id
           AND t.status IN ('pending', 'in_progress')
           AND t.due_date IS NOT NULL
           AND t.due_date < ${now.toISOString()}::timestamptz
           AND t.deleted_at IS NULL
        ),
        0
      ) AS overdue_task_count,
      (
        SELECT MAX(t2.updated_at)::text
        FROM tasks t2
        WHERE t2.case_id = c.id AND t2.deleted_at IS NULL
      ) AS last_activity_date
    FROM cases c
    LEFT JOIN tasks t_assign ON t_assign.case_id = c.id
      AND t_assign.status IN ('pending', 'in_progress')
      AND t_assign.deleted_at IS NULL
      AND t_assign.assigned_to_id IS NOT NULL
    LEFT JOIN users u ON u.id = t_assign.assigned_to_id
    WHERE c.current_stage_id = ${stageId}::uuid
      AND c.organization_id = ${orgId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.case_number, c.stage_entered_at, u.first_name, u.last_name
    ORDER BY dwell_days DESC
    LIMIT 50
  `);

  return rows.map((r) => ({
    caseId: r.case_id,
    caseNumber: r.case_number,
    dwellDays: Math.round(Number(r.dwell_days) * 10) / 10,
    assigneeName: r.assignee_name,
    overdueTaskCount: Number(r.overdue_task_count),
    lastActivityDate: r.last_activity_date,
  }));
}

/**
 * Returns cases currently stuck at a specific handoff point between
 * two teams. Used by the handoff matrix drill-through (RP-5).
 */
export async function getCasesAtHandoff(
  fromTeam: string,
  toTeam: string,
): Promise<BottleneckCase[]> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const now = new Date();

  const rows = await db.execute<{
    case_id: string;
    case_number: string;
    dwell_days: number;
    assignee_name: string | null;
    overdue_task_count: number;
    last_activity_date: string | null;
  }>(sql`
    WITH latest_transitions AS (
      SELECT DISTINCT ON (t.case_id)
        t.case_id,
        t.to_stage_id,
        t.transitioned_at
      FROM case_stage_transitions t
      INNER JOIN cases c ON c.id = t.case_id
      INNER JOIN case_stages fs ON fs.id = t.from_stage_id
      INNER JOIN case_stages ts ON ts.id = t.to_stage_id
      WHERE c.organization_id = ${orgId}
        AND c.status = 'active'
        AND c.deleted_at IS NULL
        AND fs.owning_team = ${fromTeam}
        AND ts.owning_team = ${toTeam}
      ORDER BY t.case_id, t.transitioned_at DESC
    )
    SELECT
      c.id AS case_id,
      c.case_number,
      COALESCE(
        EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - c.stage_entered_at)) / 86400,
        0
      )::float AS dwell_days,
      CASE
        WHEN u.first_name IS NOT NULL THEN CONCAT(u.first_name, ' ', u.last_name)
        ELSE NULL
      END AS assignee_name,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM tasks tk
         WHERE tk.case_id = c.id
           AND tk.status IN ('pending', 'in_progress')
           AND tk.due_date IS NOT NULL
           AND tk.due_date < ${now.toISOString()}::timestamptz
           AND tk.deleted_at IS NULL
        ),
        0
      ) AS overdue_task_count,
      (
        SELECT MAX(tk2.updated_at)::text
        FROM tasks tk2
        WHERE tk2.case_id = c.id AND tk2.deleted_at IS NULL
      ) AS last_activity_date
    FROM latest_transitions lt
    INNER JOIN cases c ON c.id = lt.case_id
      AND c.current_stage_id = lt.to_stage_id
    LEFT JOIN tasks t_assign ON t_assign.case_id = c.id
      AND t_assign.status IN ('pending', 'in_progress')
      AND t_assign.deleted_at IS NULL
      AND t_assign.assigned_to_id IS NOT NULL
    LEFT JOIN users u ON u.id = t_assign.assigned_to_id
    GROUP BY c.id, c.case_number, c.stage_entered_at, u.first_name, u.last_name
    ORDER BY dwell_days DESC
    LIMIT 50
  `);

  return rows.map((r) => ({
    caseId: r.case_id,
    caseNumber: r.case_number,
    dwellDays: Math.round(Number(r.dwell_days) * 10) / 10,
    assigneeName: r.assignee_name,
    overdueTaskCount: Number(r.overdue_task_count),
    lastActivityDate: r.last_activity_date,
  }));
}
