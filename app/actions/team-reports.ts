"use server";

import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import {
  getRoleMetricPack,
  type RoleMetricDefinition,
} from "@/lib/services/role-metrics";
import {
  classifyProblem,
  type Classification,
  type LabeledValue,
} from "@/lib/services/pattern-analysis";
import { generatePatternNarrative } from "@/lib/services/pattern-narrative";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamRollupRow = {
  team: string;
  metricKey: string;
  value: number;
  memberCount: number;
  periodStart: string;
};

export type HandoffCell = {
  fromTeam: string;
  toTeam: string;
  caseCount: number;
  avgHours: number;
  p95Hours: number;
};

export type BottleneckRow = {
  stageId: string;
  stageName: string;
  owningTeam: string | null;
  activeCaseCount: number;
  avgAgeDays: number;
  overdueTaskCount: number;
  missingArtifactCount: number;
  why: string[];
};

export type PatternAnalysisResult = {
  role: string;
  metricKey: string;
  label: string;
  classification: Classification;
  /** Plain-English summary of the verdict for non-analyst readers. */
  narrative: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// ---------------------------------------------------------------------------
// getTeamRollup
// ---------------------------------------------------------------------------

/**
 * Latest team-level metrics for a given team from team_performance_snapshots.
 */
export async function getTeamRollup(
  team: string,
  _period: "day" | "week" | "month" = "day",
): Promise<TeamRollupRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await db.execute<{
    metric_key: string;
    value: string;
    member_count: number;
    period_start: string;
  }>(sql`
    SELECT DISTINCT ON (metric_key)
      metric_key,
      value::text AS value,
      member_count,
      period_start::text AS period_start
    FROM team_performance_snapshots
    WHERE organization_id = ${orgId}
      AND team = ${team}
    ORDER BY metric_key, period_start DESC
  `);

  return rows.map((r) => ({
    team,
    metricKey: r.metric_key,
    value: Number(r.value),
    memberCount: Number(r.member_count),
    periodStart: r.period_start,
  }));
}

/**
 * All team rollups across all teams. Used on the index page.
 */
export async function getAllTeamRollups(): Promise<TeamRollupRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await db.execute<{
    team: string;
    metric_key: string;
    value: string;
    member_count: number;
    period_start: string;
  }>(sql`
    SELECT DISTINCT ON (team, metric_key)
      team,
      metric_key,
      value::text AS value,
      member_count,
      period_start::text AS period_start
    FROM team_performance_snapshots
    WHERE organization_id = ${orgId}
    ORDER BY team, metric_key, period_start DESC
  `);

  return rows.map((r) => ({
    team: r.team,
    metricKey: r.metric_key,
    value: Number(r.value),
    memberCount: Number(r.member_count),
    periodStart: r.period_start,
  }));
}

// ---------------------------------------------------------------------------
// getRolePatternAnalysis
// ---------------------------------------------------------------------------

/**
 * For a given role × metric, gather latest per-user values and run
 * classifyProblem(). Returns classification plus per-user labels.
 */
export async function getRolePatternAnalysis(
  role: string,
  metricKey: string,
): Promise<PatternAnalysisResult | null> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const pack = getRoleMetricPack(role);
  const metric: RoleMetricDefinition | undefined = pack.metrics.find(
    (m) => m.metricKey === metricKey,
  );
  if (!metric) return null;

  // Latest value per user for this role × metric
  const rows = await db.execute<{
    user_id: string;
    first_name: string;
    last_name: string;
    value: string;
  }>(sql`
    SELECT DISTINCT ON (ps.user_id)
      ps.user_id,
      u.first_name,
      u.last_name,
      ps.value::text AS value
    FROM performance_snapshots ps
    INNER JOIN users u ON u.id = ps.user_id
    WHERE ps.organization_id = ${orgId}
      AND ps.metric_key = ${metricKey}
      AND u.role = ${role}
      AND u.is_active = true
      AND u.deleted_at IS NULL
    ORDER BY ps.user_id, ps.period_start DESC
  `);

  const values: LabeledValue[] = rows.map((r) => ({
    label: `${r.first_name} ${r.last_name}`.trim(),
    value: Number(r.value),
  }));

  const classification = classifyProblem({
    values,
    target: metric.targetValue,
    direction: metric.direction,
  });

  const currentAverage =
    values.length > 0
      ? Math.round(
          (values.reduce((acc, v) => acc + v.value, 0) / values.length) * 100,
        ) / 100
      : undefined;

  const narrative = await generatePatternNarrative({
    role,
    metricKey,
    metricLabel: metric.label,
    classification,
    stats: {
      target: metric.targetValue,
      currentAverage,
    },
  });

  return {
    role,
    metricKey,
    label: metric.label,
    classification,
    narrative,
  };
}

// ---------------------------------------------------------------------------
// getCrossTeamHandoffs
// ---------------------------------------------------------------------------

/**
 * Build a handoff matrix: for each (fromTeam, toTeam) pair, average the
 * time between transitions where the owning_team changes.
 */
export async function getCrossTeamHandoffs(): Promise<HandoffCell[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await db.execute<{
    from_team: string | null;
    to_team: string | null;
    case_count: number;
    avg_hours: number;
    p95_hours: number;
  }>(sql`
    WITH handoffs AS (
      SELECT
        fs.owning_team::text AS from_team,
        ts.owning_team::text AS to_team,
        EXTRACT(EPOCH FROM (
          LEAD(t.transitioned_at) OVER (PARTITION BY t.case_id ORDER BY t.transitioned_at)
          - t.transitioned_at
        )) / 3600 AS hours_to_next,
        t.case_id
      FROM case_stage_transitions t
      INNER JOIN cases c ON c.id = t.case_id
      INNER JOIN case_stages fs ON fs.id = t.from_stage_id
      INNER JOIN case_stages ts ON ts.id = t.to_stage_id
      WHERE c.organization_id = ${orgId}
        AND c.deleted_at IS NULL
        AND fs.owning_team IS NOT NULL
        AND ts.owning_team IS NOT NULL
        AND fs.owning_team != ts.owning_team
    )
    SELECT
      from_team,
      to_team,
      COUNT(DISTINCT case_id)::int AS case_count,
      COALESCE(AVG(hours_to_next), 0)::float AS avg_hours,
      COALESCE(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY hours_to_next),
        0
      )::float AS p95_hours
    FROM handoffs
    WHERE from_team IS NOT NULL AND to_team IS NOT NULL
    GROUP BY from_team, to_team
    ORDER BY from_team, to_team
  `);

  return rows.map((r) => ({
    fromTeam: r.from_team ?? "",
    toTeam: r.to_team ?? "",
    caseCount: Number(r.case_count),
    avgHours: Math.round(Number(r.avg_hours) * 10) / 10,
    p95Hours: Math.round(Number(r.p95_hours) * 10) / 10,
  }));
}

// ---------------------------------------------------------------------------
// getBottleneckAnalysis
// ---------------------------------------------------------------------------

/**
 * For each stage, count active cases currently sitting there, average
 * their age, and join in overdue task counts to heuristically explain
 * why the stage is backed up.
 */
export async function getBottleneckAnalysis(): Promise<BottleneckRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const now = new Date();

  const rows = await db.execute<{
    stage_id: string;
    stage_name: string;
    owning_team: string | null;
    active_case_count: number;
    avg_age_days: number;
    overdue_task_count: number;
    missing_phi_count: number;
  }>(sql`
    SELECT
      s.id AS stage_id,
      s.name AS stage_name,
      s.owning_team::text AS owning_team,
      COUNT(DISTINCT c.id)::int AS active_case_count,
      COALESCE(AVG(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - c.stage_entered_at)) / 86400), 0)::float AS avg_age_days,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM tasks t
         WHERE t.case_id IN (
           SELECT id FROM cases
           WHERE current_stage_id = s.id
             AND organization_id = ${orgId}
             AND status = 'active'
             AND deleted_at IS NULL
         )
           AND t.status IN ('pending', 'in_progress')
           AND t.due_date IS NOT NULL
           AND t.due_date < ${now.toISOString()}::timestamptz
           AND t.deleted_at IS NULL
        ),
        0
      ) AS overdue_task_count,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM cases mc
         WHERE mc.current_stage_id = s.id
           AND mc.organization_id = ${orgId}
           AND mc.status = 'active'
           AND mc.deleted_at IS NULL
           AND (mc.phi_sheet_status IS NULL OR mc.phi_sheet_status = 'unassigned')
        ),
        0
      ) AS missing_phi_count
    FROM case_stages s
    LEFT JOIN cases c ON c.current_stage_id = s.id
      AND c.organization_id = ${orgId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    WHERE s.organization_id = ${orgId}
      AND s.deleted_at IS NULL
    GROUP BY s.id, s.name, s.owning_team
    HAVING COUNT(DISTINCT c.id) > 0
    ORDER BY COUNT(DISTINCT c.id) DESC, avg_age_days DESC
    LIMIT 30
  `);

  return rows
    .map<BottleneckRow>((r) => {
      const why: string[] = [];
      const activeCount = Number(r.active_case_count);
      const overdue = Number(r.overdue_task_count);
      const missingPhi = Number(r.missing_phi_count);
      const avgAge = Number(r.avg_age_days);
      if (overdue > 0) {
        why.push(`${overdue} overdue task${overdue === 1 ? "" : "s"}`);
      }
      if (missingPhi > 0) {
        why.push(
          `${missingPhi} case${missingPhi === 1 ? "" : "s"} missing PHI sheet`,
        );
      }
      if (avgAge > 30) {
        why.push(`avg case age ${Math.round(avgAge)}d`);
      }
      if (activeCount >= 10) {
        why.push(`${activeCount} cases stalled here`);
      }
      return {
        stageId: r.stage_id,
        stageName: r.stage_name,
        owningTeam: r.owning_team,
        activeCaseCount: activeCount,
        avgAgeDays: Math.round(avgAge * 10) / 10,
        overdueTaskCount: overdue,
        missingArtifactCount: missingPhi,
        why,
      };
    })
    .filter((r) => r.activeCaseCount > 0);
}

// ---------------------------------------------------------------------------
// Team list (for the pages)
// ---------------------------------------------------------------------------

export type TeamSummary = {
  team: string;
  memberCount: number;
  compositeScore: number;
};

export async function getTeamSummaries(): Promise<TeamSummary[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  // Pull member counts per team
  const memberRows = await db
    .select({
      team: users.team,
      c: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, orgId),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        isNotNull(users.team),
      ),
    )
    .groupBy(users.team);

  // We don't have a true team composite, so average each team's metric
  // scores via the team snapshots. For now return member count only.
  return memberRows
    .filter((r) => r.team !== null)
    .map((r) => ({
      team: r.team as string,
      memberCount: Number(r.c),
      compositeScore: 0,
    }));
}
