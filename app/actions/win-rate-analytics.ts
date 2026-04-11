"use server";

import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, gte, isNull, sql, desc } from "drizzle-orm";

export type WinRateDimension = "rep" | "alj" | "office" | "hearing_type";

export type WinRateOverview = {
  overallWinRate: number;
  totalDecisions: number;
  won: number;
  lost: number;
  periodDays: number;
};

export type WinRateRow = {
  name: string;
  won: number;
  lost: number;
  winRate: number;
  totalDecisions: number;
};

export type RecentDecision = {
  caseId: string;
  caseNumber: string;
  status: "closed_won" | "closed_lost";
  closedAt: string | null;
  hearingOffice: string | null;
};

export type AljStatsRow = {
  aljName: string;
  hearingCount: number;
  winRate: number;
  won: number;
  lost: number;
  avgDurationMinutes: number | null;
  lastHearingDate: string | null;
  recentDecisions: RecentDecision[];
};

export type QuarterlyWinRate = {
  quarter: string;
  won: number;
  lost: number;
  winRate: number;
  totalDecisions: number;
};

export type OfficeBreakdownRow = {
  office: string;
  won: number;
  lost: number;
  winRate: number;
  totalDecisions: number;
};

export type AljCase = {
  caseId: string;
  caseNumber: string;
  status: "closed_won" | "closed_lost" | string;
  closedAt: string | null;
  hearingDate: string | null;
  hearingOffice: string | null;
  claimantName: string | null;
};

export type AljDetail = {
  aljName: string;
  totalHearings: number;
  won: number;
  lost: number;
  winRate: number;
  avgDurationMinutes: number | null;
  byQuarter: QuarterlyWinRate[];
  byOffice: OfficeBreakdownRow[];
  allCases: AljCase[];
};

function periodCutoff(periodDays: number): Date | null {
  if (!Number.isFinite(periodDays) || periodDays <= 0) return null;
  return new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
}

/**
 * Headline win-rate stats within the given window.
 * periodDays = 0 (or negative) means "all time".
 */
export async function getWinRateOverview(
  periodDays: number,
): Promise<WinRateOverview> {
  const session = await requireSession();
  const cutoff = periodCutoff(periodDays);

  const conds = [
    eq(cases.organizationId, session.organizationId),
    isNull(cases.deletedAt),
    sql`${cases.status} IN ('closed_won', 'closed_lost')`,
  ];
  if (cutoff) {
    conds.push(gte(cases.closedAt, cutoff));
  }

  const rows = await db
    .select({ status: cases.status, count: sql<number>`COUNT(*)::int` })
    .from(cases)
    .where(and(...conds))
    .groupBy(cases.status);

  let won = 0;
  let lost = 0;
  for (const row of rows) {
    if (row.status === "closed_won") won = Number(row.count);
    if (row.status === "closed_lost") lost = Number(row.count);
  }
  const totalDecisions = won + lost;
  const overallWinRate = totalDecisions > 0 ? won / totalDecisions : 0;

  return {
    overallWinRate,
    totalDecisions,
    won,
    lost,
    periodDays,
  };
}

/**
 * Win rates grouped by the chosen dimension.
 * Sorted by total decisions DESC.
 */
export async function getWinRatesByDimension(
  dimension: WinRateDimension,
  periodDays: number,
): Promise<WinRateRow[]> {
  const session = await requireSession();
  const cutoff = periodCutoff(periodDays);

  if (dimension === "rep") {
    const rows = await db.execute<{
      name: string;
      won: number;
      lost: number;
    }>(sql`
      SELECT
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), 'Unassigned') AS name,
        SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
      FROM cases c
      LEFT JOIN case_assignments ca
        ON ca.case_id = c.id
       AND ca.is_primary = true
       AND ca.unassigned_at IS NULL
      LEFT JOIN users u ON u.id = ca.user_id
      WHERE c.organization_id = ${session.organizationId}
        AND c.deleted_at IS NULL
        AND c.status IN ('closed_won', 'closed_lost')
        ${cutoff ? sql`AND c.closed_at >= ${cutoff}` : sql``}
      GROUP BY name
      HAVING SUM(CASE WHEN c.status IN ('closed_won', 'closed_lost') THEN 1 ELSE 0 END) > 0
      ORDER BY (SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END) + SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)) DESC
    `);
    return rows.map((r) => {
      const won = Number(r.won);
      const lost = Number(r.lost);
      const total = won + lost;
      return {
        name: r.name,
        won,
        lost,
        winRate: total > 0 ? won / total : 0,
        totalDecisions: total,
      };
    });
  }

  if (dimension === "hearing_type") {
    const rows = await db.execute<{
      name: string;
      won: number;
      lost: number;
    }>(sql`
      SELECT
        COALESCE(NULLIF(c.application_type_primary, ''), 'Unknown') AS name,
        SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
      FROM cases c
      WHERE c.organization_id = ${session.organizationId}
        AND c.deleted_at IS NULL
        AND c.status IN ('closed_won', 'closed_lost')
        ${cutoff ? sql`AND c.closed_at >= ${cutoff}` : sql``}
      GROUP BY name
      ORDER BY (SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END) + SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)) DESC
    `);
    return rows.map((r) => {
      const won = Number(r.won);
      const lost = Number(r.lost);
      const total = won + lost;
      return {
        name: r.name,
        won,
        lost,
        winRate: total > 0 ? won / total : 0,
        totalDecisions: total,
      };
    });
  }

  // alj | office — both live on cases directly
  const column = dimension === "alj" ? sql`c.admin_law_judge` : sql`c.hearing_office`;
  const fallback = dimension === "alj" ? "Unassigned ALJ" : "Unknown Office";

  const rows = await db.execute<{
    name: string;
    won: number;
    lost: number;
  }>(sql`
    SELECT
      COALESCE(NULLIF(${column}, ''), ${fallback}) AS name,
      SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
      SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
    FROM cases c
    WHERE c.organization_id = ${session.organizationId}
      AND c.deleted_at IS NULL
      AND c.status IN ('closed_won', 'closed_lost')
      ${cutoff ? sql`AND c.closed_at >= ${cutoff}` : sql``}
    GROUP BY name
    ORDER BY (SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END) + SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)) DESC
  `);

  return rows.map((r) => {
    const won = Number(r.won);
    const lost = Number(r.lost);
    const total = won + lost;
    return {
      name: r.name,
      won,
      lost,
      winRate: total > 0 ? won / total : 0,
      totalDecisions: total,
    };
  });
}

/**
 * Returns every ALJ encountered for this org with roll-up stats.
 * An ALJ is considered "encountered" if any case or any calendar hearing
 * event references their name. Cases with NULL admin_law_judge are ignored.
 */
export async function getAllAljStats(): Promise<AljStatsRow[]> {
  const session = await requireSession();

  const rows = await db.execute<{
    alj_name: string;
    hearing_count: number;
    won: number;
    lost: number;
    avg_duration_minutes: number | null;
    last_hearing_date: string | null;
  }>(sql`
    WITH case_alj AS (
      SELECT
        c.admin_law_judge AS alj_name,
        c.id AS case_id,
        c.status,
        c.hearing_date,
        c.closed_at
      FROM cases c
      WHERE c.organization_id = ${session.organizationId}
        AND c.deleted_at IS NULL
        AND c.admin_law_judge IS NOT NULL
        AND TRIM(c.admin_law_judge) <> ''
    ),
    event_alj AS (
      SELECT
        ce.admin_law_judge AS alj_name,
        ce.case_id,
        ce.start_at,
        ce.end_at
      FROM calendar_events ce
      WHERE ce.organization_id = ${session.organizationId}
        AND ce.deleted_at IS NULL
        AND ce.admin_law_judge IS NOT NULL
        AND TRIM(ce.admin_law_judge) <> ''
    ),
    alj_durations AS (
      SELECT
        alj_name,
        AVG(EXTRACT(EPOCH FROM (end_at - start_at)) / 60.0) AS avg_duration_minutes,
        MAX(start_at) AS last_event_at
      FROM event_alj
      WHERE end_at IS NOT NULL
      GROUP BY alj_name
    ),
    alj_all_events AS (
      SELECT alj_name, MAX(start_at) AS last_event_at
      FROM event_alj
      GROUP BY alj_name
    ),
    alj_case_rollup AS (
      SELECT
        alj_name,
        COUNT(*)::int AS hearing_count,
        SUM(CASE WHEN status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
        SUM(CASE WHEN status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost,
        MAX(COALESCE(hearing_date, closed_at)) AS last_case_date
      FROM case_alj
      GROUP BY alj_name
    ),
    all_alj_names AS (
      SELECT alj_name FROM alj_case_rollup
      UNION
      SELECT alj_name FROM alj_all_events
    )
    SELECT
      a.alj_name AS alj_name,
      COALESCE(r.hearing_count, 0)::int AS hearing_count,
      COALESCE(r.won, 0)::int AS won,
      COALESCE(r.lost, 0)::int AS lost,
      ad.avg_duration_minutes AS avg_duration_minutes,
      GREATEST(
        COALESCE(r.last_case_date, 'epoch'::timestamptz),
        COALESCE(ae.last_event_at, 'epoch'::timestamptz)
      )::text AS last_hearing_date
    FROM all_alj_names a
    LEFT JOIN alj_case_rollup r ON r.alj_name = a.alj_name
    LEFT JOIN alj_durations ad ON ad.alj_name = a.alj_name
    LEFT JOIN alj_all_events ae ON ae.alj_name = a.alj_name
    ORDER BY COALESCE(r.hearing_count, 0) DESC, a.alj_name ASC
  `);

  // Pull recent decisions per ALJ in a single query
  const recentRows = await db.execute<{
    alj_name: string;
    case_id: string;
    case_number: string;
    status: string;
    closed_at: string | null;
    hearing_office: string | null;
    rn: number;
  }>(sql`
    SELECT * FROM (
      SELECT
        c.admin_law_judge AS alj_name,
        c.id::text AS case_id,
        c.case_number AS case_number,
        c.status::text AS status,
        c.closed_at::text AS closed_at,
        c.hearing_office AS hearing_office,
        ROW_NUMBER() OVER (
          PARTITION BY c.admin_law_judge
          ORDER BY c.closed_at DESC NULLS LAST
        ) AS rn
      FROM cases c
      WHERE c.organization_id = ${session.organizationId}
        AND c.deleted_at IS NULL
        AND c.admin_law_judge IS NOT NULL
        AND TRIM(c.admin_law_judge) <> ''
        AND c.status IN ('closed_won', 'closed_lost')
    ) ranked
    WHERE rn <= 5
  `);

  const recentByAlj = new Map<string, RecentDecision[]>();
  for (const r of recentRows) {
    const list = recentByAlj.get(r.alj_name) ?? [];
    list.push({
      caseId: r.case_id,
      caseNumber: r.case_number,
      status: r.status as "closed_won" | "closed_lost",
      closedAt: r.closed_at,
      hearingOffice: r.hearing_office,
    });
    recentByAlj.set(r.alj_name, list);
  }

  return rows.map((r) => {
    const won = Number(r.won);
    const lost = Number(r.lost);
    const total = won + lost;
    const lastStr = r.last_hearing_date ?? null;
    const lastDate =
      lastStr && !lastStr.startsWith("1970-01-01") ? lastStr : null;
    return {
      aljName: r.alj_name,
      hearingCount: Number(r.hearing_count),
      winRate: total > 0 ? won / total : 0,
      won,
      lost,
      avgDurationMinutes:
        r.avg_duration_minutes !== null
          ? Number(r.avg_duration_minutes)
          : null,
      lastHearingDate: lastDate,
      recentDecisions: recentByAlj.get(r.alj_name) ?? [],
    };
  });
}

/**
 * Full ALJ profile: cases, quarterly trend, office breakdown.
 */
export async function getAljDetail(aljName: string): Promise<AljDetail | null> {
  const session = await requireSession();

  if (!aljName || aljName.trim() === "") return null;

  const casesRows = await db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      closedAt: cases.closedAt,
      hearingDate: cases.hearingDate,
      hearingOffice: cases.hearingOffice,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
        eq(cases.adminLawJudge, aljName),
      ),
    )
    .orderBy(desc(cases.closedAt));

  if (casesRows.length === 0) {
    // Still might have calendar events for this ALJ — return empty profile
    return {
      aljName,
      totalHearings: 0,
      won: 0,
      lost: 0,
      winRate: 0,
      avgDurationMinutes: null,
      byQuarter: [],
      byOffice: [],
      allCases: [],
    };
  }

  let won = 0;
  let lost = 0;
  for (const c of casesRows) {
    if (c.status === "closed_won") won += 1;
    if (c.status === "closed_lost") lost += 1;
  }
  const totalDecisions = won + lost;
  const winRate = totalDecisions > 0 ? won / totalDecisions : 0;

  // Quarterly trend
  const quarterRows = await db.execute<{
    quarter: string;
    won: number;
    lost: number;
  }>(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('quarter', c.closed_at), 'YYYY "Q"Q') AS quarter,
      SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
      SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
    FROM cases c
    WHERE c.organization_id = ${session.organizationId}
      AND c.deleted_at IS NULL
      AND c.admin_law_judge = ${aljName}
      AND c.status IN ('closed_won', 'closed_lost')
      AND c.closed_at IS NOT NULL
    GROUP BY DATE_TRUNC('quarter', c.closed_at)
    ORDER BY DATE_TRUNC('quarter', c.closed_at) ASC
  `);

  const byQuarter: QuarterlyWinRate[] = quarterRows.map((q) => {
    const qw = Number(q.won);
    const ql = Number(q.lost);
    const total = qw + ql;
    return {
      quarter: q.quarter,
      won: qw,
      lost: ql,
      totalDecisions: total,
      winRate: total > 0 ? qw / total : 0,
    };
  });

  // Office breakdown
  const officeRows = await db.execute<{
    office: string;
    won: number;
    lost: number;
  }>(sql`
    SELECT
      COALESCE(NULLIF(c.hearing_office, ''), 'Unknown Office') AS office,
      SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END)::int AS won,
      SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)::int AS lost
    FROM cases c
    WHERE c.organization_id = ${session.organizationId}
      AND c.deleted_at IS NULL
      AND c.admin_law_judge = ${aljName}
      AND c.status IN ('closed_won', 'closed_lost')
    GROUP BY office
    ORDER BY (SUM(CASE WHEN c.status = 'closed_won' THEN 1 ELSE 0 END) + SUM(CASE WHEN c.status = 'closed_lost' THEN 1 ELSE 0 END)) DESC
  `);

  const byOffice: OfficeBreakdownRow[] = officeRows.map((o) => {
    const ow = Number(o.won);
    const ol = Number(o.lost);
    const total = ow + ol;
    return {
      office: o.office,
      won: ow,
      lost: ol,
      totalDecisions: total,
      winRate: total > 0 ? ow / total : 0,
    };
  });

  // Avg hearing duration from calendar events (best-effort)
  const durationRows = await db.execute<{ avg_minutes: number | null }>(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (ce.end_at - ce.start_at)) / 60.0) AS avg_minutes
    FROM calendar_events ce
    WHERE ce.organization_id = ${session.organizationId}
      AND ce.deleted_at IS NULL
      AND ce.admin_law_judge = ${aljName}
      AND ce.end_at IS NOT NULL
  `);
  const avgDurationMinutes = durationRows[0]?.avg_minutes
    ? Number(durationRows[0].avg_minutes)
    : null;

  // Pull claimant names for the cases (best effort — leads table join)
  const caseIds = casesRows.map((c) => c.caseId);
  const nameMap = new Map<string, string>();
  if (caseIds.length > 0) {
    const nameRows = await db.execute<{
      case_id: string;
      claimant_name: string | null;
    }>(sql`
      SELECT
        c.id::text AS case_id,
        NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), '') AS claimant_name
      FROM cases c
      LEFT JOIN leads l ON l.id = c.lead_id
      WHERE c.id IN (${sql.join(caseIds.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const row of nameRows) {
      if (row.claimant_name) nameMap.set(row.case_id, row.claimant_name);
    }
  }

  const allCases: AljCase[] = casesRows.map((c) => ({
    caseId: c.caseId,
    caseNumber: c.caseNumber,
    status: c.status,
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    hearingDate: c.hearingDate ? c.hearingDate.toISOString() : null,
    hearingOffice: c.hearingOffice,
    claimantName: nameMap.get(c.caseId) ?? null,
  }));

  return {
    aljName,
    totalHearings: casesRows.length,
    won,
    lost,
    winRate,
    avgDurationMinutes,
    byQuarter,
    byOffice,
    allCases,
  };
}

