"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseAssignments,
  caseStageTransitions,
  caseStageGroups,
  caseStages,
  caseRiskScores,
  communications,
  users,
  aiDrafts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, gte, lte, isNull, sql, desc } from "drizzle-orm";
import { getAiSavings } from "@/lib/services/ai-savings";

// ---------------------------------------------------------------------------
// Shared types / filters
// ---------------------------------------------------------------------------

export type InsightsAggregation = "day" | "week" | "month" | "year";

export type InsightsFilters = {
  /** Optional practice area filter (maps to `cases.application_type_primary`). */
  practiceArea?: string | null;
  /** Optional user filter (maps to the assigned user on a case). */
  userId?: string | null;
  /** Time aggregation bucket for the trend charts. */
  aggregation?: InsightsAggregation;
  /** Start of the window (inclusive). Null = no lower bound. */
  startDate?: string | null;
  /** End of the window (inclusive). Null = now. */
  endDate?: string | null;
};

export type KpiTiles = {
  totalActiveCases: number;
  newCases: number;
  closedCases: number;
  avgTimeInStageDays: number;
};

export type TimeSeriesPoint = {
  /** ISO date string for the bucket (e.g. "2026-04-13" or "2026-04"). */
  period: string;
  opened: number;
  closed: number;
};

export type OutcomeMixPoint = {
  period: string;
  won: number;
  lost: number;
  withdrawn: number;
};

export type StageThroughputRow = {
  stageGroupName: string;
  stageGroupColor: string | null;
  count: number;
};

export type RiskSharePoint = {
  /** Bucketed date label (day). */
  period: string;
  /** Percent of cases tagged high/critical risk at that time. */
  atRiskPct: number;
};

export type PracticeAreaOption = {
  value: string;
  label: string;
};

export type UserOption = {
  value: string;
  label: string;
  role: string;
};

export type FirmInsights = {
  filters: Required<
    Pick<InsightsFilters, "aggregation" | "startDate" | "endDate">
  > & {
    practiceArea: string | null;
    userId: string | null;
  };
  practiceAreas: PracticeAreaOption[];
  userOptions: UserOption[];
  tiles: KpiTiles;
  casesOverTime: TimeSeriesPoint[];
  outcomeMix: OutcomeMixPoint[];
  stageThroughput: StageThroughputRow[];
  atRiskShare: RiskSharePoint[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWindow(filters: InsightsFilters): { since: Date; until: Date } {
  const until = filters.endDate
    ? (() => {
        const d = new Date(filters.endDate);
        if (Number.isNaN(d.getTime())) return new Date();
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : new Date();

  const since = filters.startDate
    ? (() => {
        const d = new Date(filters.startDate);
        if (Number.isNaN(d.getTime())) {
          return new Date(Date.now() - 30 * 86400 * 1000);
        }
        d.setHours(0, 0, 0, 0);
        return d;
      })()
    : new Date(Date.now() - 30 * 86400 * 1000);

  return { since, until };
}

function resolveAggregation(
  value: InsightsAggregation | undefined,
): InsightsAggregation {
  if (value === "day" || value === "week" || value === "month" || value === "year") {
    return value;
  }
  return "week";
}

function truncUnit(agg: InsightsAggregation): string {
  switch (agg) {
    case "day":
      return "day";
    case "week":
      return "week";
    case "month":
      return "month";
    case "year":
      return "year";
  }
}

/**
 * Produce an ISO date key (yyyy-mm-dd) for day buckets. Other aggregations
 * still return full ISO date (truncated server-side) — the UI slices as
 * needed for readable x-axis labels.
 */
function formatBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getFirmInsights — C1
// ---------------------------------------------------------------------------

export async function getFirmInsights(
  filters: InsightsFilters = {},
): Promise<FirmInsights> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const aggregation = resolveAggregation(filters.aggregation);
  const { since, until } = resolveWindow(filters);
  const practiceArea = filters.practiceArea ?? null;
  const userId = filters.userId ?? null;

  const emptyTiles: KpiTiles = {
    totalActiveCases: 0,
    newCases: 0,
    closedCases: 0,
    avgTimeInStageDays: 0,
  };

  const emptyReturn: FirmInsights = {
    filters: {
      aggregation,
      startDate: since.toISOString().slice(0, 10),
      endDate: until.toISOString().slice(0, 10),
      practiceArea,
      userId,
    },
    practiceAreas: [],
    userOptions: [],
    tiles: emptyTiles,
    casesOverTime: [],
    outcomeMix: [],
    stageThroughput: [],
    atRiskShare: [],
  };

  try {
    // --- Filter options ----------------------------------------------------
    const practiceAreaRows = await db
      .selectDistinct({ value: cases.applicationTypePrimary })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
          sql`${cases.applicationTypePrimary} IS NOT NULL AND ${cases.applicationTypePrimary} <> ''`,
        ),
      );

    const practiceAreas: PracticeAreaOption[] = practiceAreaRows
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

    const userRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(users.firstName, users.lastName);

    const userOptions: UserOption[] = userRows.map((u) => ({
      value: u.id,
      label:
        `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
        (u.email ?? "unknown"),
      role: u.role,
    }));

    // --- Build "cases" filter clauses, reused across queries ---------------
    const practiceAreaClause = practiceArea
      ? sql`AND c.application_type_primary = ${practiceArea}`
      : sql``;
    const userJoinClause = userId
      ? sql`INNER JOIN case_assignments ca
              ON ca.case_id = c.id
             AND ca.user_id = ${userId}
             AND ca.unassigned_at IS NULL`
      : sql``;

    // --- Tiles -------------------------------------------------------------
    // activeCount ignores the selected window (it's a snapshot).
    const activeRow = await db.execute<{ n: number }>(sql`
      SELECT COUNT(DISTINCT c.id)::int AS n
      FROM cases c
      ${userJoinClause}
      WHERE c.organization_id = ${orgId}
        AND c.status = 'active'
        AND c.deleted_at IS NULL
        ${practiceAreaClause}
    `);

    const newRow = await db.execute<{ n: number }>(sql`
      SELECT COUNT(DISTINCT c.id)::int AS n
      FROM cases c
      ${userJoinClause}
      WHERE c.organization_id = ${orgId}
        AND c.deleted_at IS NULL
        AND c.created_at >= ${since.toISOString()}
        AND c.created_at <= ${until.toISOString()}
        ${practiceAreaClause}
    `);

    const closedRow = await db.execute<{ n: number }>(sql`
      SELECT COUNT(DISTINCT c.id)::int AS n
      FROM cases c
      ${userJoinClause}
      WHERE c.organization_id = ${orgId}
        AND c.deleted_at IS NULL
        AND c.closed_at IS NOT NULL
        AND c.closed_at >= ${since.toISOString()}
        AND c.closed_at <= ${until.toISOString()}
        ${practiceAreaClause}
    `);

    // Avg time-in-stage (days) across transitions in the window.
    const avgStageRow = await db.execute<{ avg_days: number }>(sql`
      WITH durations AS (
        SELECT
          EXTRACT(EPOCH FROM (
            LEAD(t.transitioned_at) OVER (
              PARTITION BY t.case_id ORDER BY t.transitioned_at
            ) - t.transitioned_at
          )) / 86400.0 AS days
        FROM case_stage_transitions t
        INNER JOIN cases c ON c.id = t.case_id
        ${userJoinClause}
        WHERE c.organization_id = ${orgId}
          AND c.deleted_at IS NULL
          AND t.transitioned_at >= ${since.toISOString()}
          AND t.transitioned_at <= ${until.toISOString()}
          ${practiceAreaClause}
      )
      SELECT COALESCE(AVG(days), 0)::float AS avg_days
      FROM durations
      WHERE days IS NOT NULL
    `);

    const tiles: KpiTiles = {
      totalActiveCases: Number(
        (activeRow as unknown as Array<{ n: number }>)[0]?.n ?? 0,
      ),
      newCases: Number(
        (newRow as unknown as Array<{ n: number }>)[0]?.n ?? 0,
      ),
      closedCases: Number(
        (closedRow as unknown as Array<{ n: number }>)[0]?.n ?? 0,
      ),
      avgTimeInStageDays: Math.round(
        Number(
          (avgStageRow as unknown as Array<{ avg_days: number }>)[0]
            ?.avg_days ?? 0,
        ) * 10,
      ) / 10,
    };

    // --- Cases opened / closed over time -----------------------------------
    const trunc = truncUnit(aggregation);
    const openedRows = await db.execute<{
      period: string;
      opened: number;
      closed: number;
    }>(sql`
      WITH opened AS (
        SELECT
          DATE_TRUNC(${trunc}, c.created_at) AS period,
          COUNT(*)::int AS cnt
        FROM cases c
        ${userJoinClause}
        WHERE c.organization_id = ${orgId}
          AND c.deleted_at IS NULL
          AND c.created_at >= ${since.toISOString()}
          AND c.created_at <= ${until.toISOString()}
          ${practiceAreaClause}
        GROUP BY 1
      ),
      closed AS (
        SELECT
          DATE_TRUNC(${trunc}, c.closed_at) AS period,
          COUNT(*)::int AS cnt
        FROM cases c
        ${userJoinClause}
        WHERE c.organization_id = ${orgId}
          AND c.deleted_at IS NULL
          AND c.closed_at IS NOT NULL
          AND c.closed_at >= ${since.toISOString()}
          AND c.closed_at <= ${until.toISOString()}
          ${practiceAreaClause}
        GROUP BY 1
      )
      SELECT
        TO_CHAR(COALESCE(o.period, cl.period), 'YYYY-MM-DD') AS period,
        COALESCE(o.cnt, 0)::int AS opened,
        COALESCE(cl.cnt, 0)::int AS closed
      FROM opened o
      FULL OUTER JOIN closed cl ON o.period = cl.period
      ORDER BY 1
    `);

    const casesOverTime: TimeSeriesPoint[] = (
      openedRows as unknown as Array<{
        period: string;
        opened: number;
        closed: number;
      }>
    ).map((r) => ({
      period: String(r.period ?? ""),
      opened: Number(r.opened ?? 0),
      closed: Number(r.closed ?? 0),
    }));

    // --- Outcome mix (stacked: won / lost / withdrawn) ---------------------
    const outcomeRows = await db.execute<{
      period: string;
      won: number;
      lost: number;
      withdrawn: number;
    }>(sql`
      SELECT
        TO_CHAR(DATE_TRUNC(${trunc}, c.closed_at), 'YYYY-MM-DD') AS period,
        COUNT(*) FILTER (WHERE c.status = 'closed_won')::int AS won,
        COUNT(*) FILTER (WHERE c.status = 'closed_lost')::int AS lost,
        COUNT(*) FILTER (WHERE c.status = 'closed_withdrawn')::int AS withdrawn
      FROM cases c
      ${userJoinClause}
      WHERE c.organization_id = ${orgId}
        AND c.deleted_at IS NULL
        AND c.closed_at IS NOT NULL
        AND c.closed_at >= ${since.toISOString()}
        AND c.closed_at <= ${until.toISOString()}
        ${practiceAreaClause}
      GROUP BY 1
      ORDER BY 1
    `);

    const outcomeMix: OutcomeMixPoint[] = (
      outcomeRows as unknown as Array<{
        period: string;
        won: number;
        lost: number;
        withdrawn: number;
      }>
    ).map((r) => ({
      period: String(r.period ?? ""),
      won: Number(r.won ?? 0),
      lost: Number(r.lost ?? 0),
      withdrawn: Number(r.withdrawn ?? 0),
    }));

    // --- Stage throughput (funnel) -----------------------------------------
    const stageRows = await db
      .select({
        stageGroupName: caseStageGroups.name,
        stageGroupColor: caseStageGroups.color,
        displayOrder: caseStageGroups.displayOrder,
        count: sql<number>`COUNT(DISTINCT ${cases.id})::int`,
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
          practiceArea
            ? eq(cases.applicationTypePrimary, practiceArea)
            : undefined,
        ),
      )
      .leftJoin(
        caseAssignments,
        userId
          ? and(
              eq(caseAssignments.caseId, cases.id),
              eq(caseAssignments.userId, userId),
              isNull(caseAssignments.unassignedAt),
            )
          : sql`1=0`,
      )
      .where(eq(caseStageGroups.organizationId, orgId))
      .groupBy(
        caseStageGroups.name,
        caseStageGroups.color,
        caseStageGroups.displayOrder,
      )
      .orderBy(caseStageGroups.displayOrder);

    const stageThroughput: StageThroughputRow[] = stageRows.map((r) => ({
      stageGroupName: r.stageGroupName,
      stageGroupColor: r.stageGroupColor,
      count: Number(r.count ?? 0),
    }));

    // --- At-risk share over time -------------------------------------------
    // Approximation: current snapshot of at-risk cases (high/critical) as a
    // share of active cases, replayed per bucket using case created_at as the
    // time anchor. This is a "cohort" view; until we capture risk-history, we
    // use the latest score and bucket by creation date so the chart is not
    // empty.
    const riskRows = await db.execute<{
      period: string;
      risky: number;
      total: number;
    }>(sql`
      SELECT
        TO_CHAR(DATE_TRUNC(${trunc}, c.created_at), 'YYYY-MM-DD') AS period,
        COUNT(*) FILTER (
          WHERE r.risk_band IN ('high', 'critical')
        )::int AS risky,
        COUNT(*)::int AS total
      FROM cases c
      LEFT JOIN case_risk_scores r ON r.case_id = c.id
      ${userJoinClause}
      WHERE c.organization_id = ${orgId}
        AND c.deleted_at IS NULL
        AND c.created_at >= ${since.toISOString()}
        AND c.created_at <= ${until.toISOString()}
        ${practiceAreaClause}
      GROUP BY 1
      ORDER BY 1
    `);

    const atRiskShare: RiskSharePoint[] = (
      riskRows as unknown as Array<{
        period: string;
        risky: number;
        total: number;
      }>
    ).map((r) => {
      const risky = Number(r.risky ?? 0);
      const total = Number(r.total ?? 0);
      return {
        period: String(r.period ?? ""),
        atRiskPct: total > 0 ? Math.round((risky / total) * 100) : 0,
      };
    });

    return {
      filters: {
        aggregation,
        startDate: formatBucket(since),
        endDate: formatBucket(until),
        practiceArea,
        userId,
      },
      practiceAreas,
      userOptions,
      tiles,
      casesOverTime,
      outcomeMix,
      stageThroughput,
      atRiskShare,
    };
  } catch {
    return { ...emptyReturn };
  }
}

// ---------------------------------------------------------------------------
// getExecRoi — C2
// ---------------------------------------------------------------------------

export type ExecRoiMetrics = {
  filters: Required<
    Pick<InsightsFilters, "startDate" | "endDate">
  >;
  hero: {
    totalActiveCases: number;
    /** Stubbed until client portal ships. */
    clientEngagementPct: number;
    /** Stubbed until user-login tracking ships. */
    userLogins: number;
    /** Rough FTE-equivalents saved: AI hours / 160 hrs/month. */
    fteEquivalentsSaved: number;
    /** Stubbed until NPS / portal ship. */
    npsReferralEstimate: number;
  };
  revenue: {
    /** Stubbed until billing integration ships. */
    costToServePerCase: number | null;
    revenuePerCase: number | null;
    aiDollarsSaved: number;
    aiHoursSaved: number;
    netRoi: number | null;
  };
};

export async function getExecRoi(
  filters: InsightsFilters = {},
): Promise<ExecRoiMetrics> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const { since, until } = resolveWindow(filters);
  const sinceDays = Math.max(
    1,
    Math.round((until.getTime() - since.getTime()) / 86400000),
  );

  const stub: ExecRoiMetrics = {
    filters: {
      startDate: formatBucket(since),
      endDate: formatBucket(until),
    },
    hero: {
      totalActiveCases: 0,
      clientEngagementPct: 0,
      userLogins: 0,
      fteEquivalentsSaved: 0,
      npsReferralEstimate: 0,
    },
    revenue: {
      costToServePerCase: null,
      revenuePerCase: null,
      aiDollarsSaved: 0,
      aiHoursSaved: 0,
      netRoi: null,
    },
  };

  try {
    const activeRow = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      );

    const aiSavings = await getAiSavings(orgId, sinceDays);

    // ~160 billable hours / month maps to one FTE-equivalent.
    const fteEquivalentsSaved =
      Math.round((aiSavings.hoursSaved / 160) * 10) / 10;

    // Revenue stubs — until invoices or a cost model are wired up we can't
    // compute meaningful dollars per case. We still surface the AI dollars
    // saved so the card isn't empty.
    return {
      filters: {
        startDate: formatBucket(since),
        endDate: formatBucket(until),
      },
      hero: {
        totalActiveCases: Number(activeRow[0]?.c ?? 0),
        clientEngagementPct: 0, // stub
        userLogins: 0, // stub
        fteEquivalentsSaved,
        npsReferralEstimate: 0, // stub
      },
      revenue: {
        costToServePerCase: null,
        revenuePerCase: null,
        aiDollarsSaved: aiSavings.dollarsSaved,
        aiHoursSaved: aiSavings.hoursSaved,
        netRoi: null,
      },
    };
  } catch {
    return stub;
  }
}

// ---------------------------------------------------------------------------
// getStaffUsage — C6
// ---------------------------------------------------------------------------

export type StaffUsageRow = {
  userId: string;
  name: string;
  role: string;
  lastLoginAt: string | null;
  activeCaseCount: number;
  messagesSent: number;
  avgResponseMinutes: number;
  aiDraftsApproved: number;
  aiHoursSaved: number;
};

export type StaffUsageTiles = {
  activeUsersThisPeriod: number;
  avgCasesPerUser: number;
  avgResponseMinutes: number;
  totalAiAssistedActions: number;
};

export type AiAdoptionSummary = {
  aiDraftedOutboundPct: number;
  totalAiHoursSaved: number;
  topUsers: Array<{
    userId: string;
    name: string;
    aiDraftsApproved: number;
  }>;
};

export type StaffUsage = {
  filters: Required<
    Pick<InsightsFilters, "startDate" | "endDate">
  >;
  tiles: StaffUsageTiles;
  perUser: StaffUsageRow[];
  aiAdoption: AiAdoptionSummary;
};

export async function getStaffUsage(
  filters: InsightsFilters = {},
): Promise<StaffUsage> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const { since, until } = resolveWindow(filters);
  const sinceDays = Math.max(
    1,
    Math.round((until.getTime() - since.getTime()) / 86400000),
  );

  const empty: StaffUsage = {
    filters: {
      startDate: formatBucket(since),
      endDate: formatBucket(until),
    },
    tiles: {
      activeUsersThisPeriod: 0,
      avgCasesPerUser: 0,
      avgResponseMinutes: 0,
      totalAiAssistedActions: 0,
    },
    perUser: [],
    aiAdoption: {
      aiDraftedOutboundPct: 0,
      totalAiHoursSaved: 0,
      topUsers: [],
    },
  };

  try {
    // Base user set (active, not deleted)
    const userRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    if (userRows.length === 0) return empty;

    // Active case counts via assignments
    const activeAssignRows = await db
      .select({
        userId: caseAssignments.userId,
        c: sql<number>`COUNT(DISTINCT ${cases.id})::int`,
      })
      .from(caseAssignments)
      .innerJoin(
        cases,
        and(
          eq(caseAssignments.caseId, cases.id),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      )
      .where(isNull(caseAssignments.unassignedAt))
      .groupBy(caseAssignments.userId);

    const activeByUser = new Map(
      activeAssignRows.map((r) => [r.userId, Number(r.c ?? 0)]),
    );

    // Messages sent (outbound, per user, within window)
    const outboundRows = await db
      .select({
        userId: communications.userId,
        c: sql<number>`COUNT(*)::int`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, orgId),
          eq(communications.direction, "outbound"),
          gte(communications.createdAt, since),
          lte(communications.createdAt, until),
        ),
      )
      .groupBy(communications.userId);

    const outboundByUser = new Map<string, number>();
    for (const r of outboundRows) {
      if (!r.userId) continue;
      outboundByUser.set(r.userId, Number(r.c ?? 0));
    }

    // Avg response time per user
    const respRows = await db.execute<{
      user_id: string;
      avg_seconds: number | null;
    }>(sql`
      SELECT
        responded_by AS user_id,
        AVG(response_time_seconds)::int AS avg_seconds
      FROM communications
      WHERE organization_id = ${orgId}
        AND responded_at IS NOT NULL
        AND response_time_seconds IS NOT NULL
        AND responded_at >= ${since.toISOString()}
        AND responded_at <= ${until.toISOString()}
        AND responded_by IS NOT NULL
      GROUP BY 1
    `);

    const respByUser = new Map<string, number>();
    for (const r of respRows as unknown as Array<{
      user_id: string;
      avg_seconds: number | null;
    }>) {
      const secs = Number(r.avg_seconds ?? 0);
      respByUser.set(
        r.user_id,
        secs > 0 ? Math.round((secs / 60) * 10) / 10 : 0,
      );
    }

    // AI drafts approved per user (within window)
    const draftsTableExists = await tableExists("ai_drafts");
    const approvedByUser = new Map<string, number>();
    let totalApprovedDrafts = 0;

    if (draftsTableExists) {
      const draftRows = await db
        .select({
          userId: aiDrafts.approvedBy,
          c: sql<number>`COUNT(*)::int`,
        })
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.organizationId, orgId),
            eq(aiDrafts.status, "approved"),
            gte(aiDrafts.createdAt, since),
            lte(aiDrafts.createdAt, until),
          ),
        )
        .groupBy(aiDrafts.approvedBy);

      for (const r of draftRows) {
        if (!r.userId) continue;
        approvedByUser.set(r.userId, Number(r.c ?? 0));
        totalApprovedDrafts += Number(r.c ?? 0);
      }
    }

    // Org-wide AI savings / hours (simple proportional share per user)
    const aiSavings = await getAiSavings(orgId, sinceDays);
    const perDraftHours =
      totalApprovedDrafts > 0
        ? aiSavings.hoursSaved / totalApprovedDrafts
        : 0;

    // Assemble per-user rows
    const perUser: StaffUsageRow[] = userRows
      .map<StaffUsageRow>((u) => {
        const approved = approvedByUser.get(u.id) ?? 0;
        return {
          userId: u.id,
          name:
            `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
            (u.email ?? "unknown"),
          role: u.role,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          activeCaseCount: activeByUser.get(u.id) ?? 0,
          messagesSent: outboundByUser.get(u.id) ?? 0,
          avgResponseMinutes: respByUser.get(u.id) ?? 0,
          aiDraftsApproved: approved,
          aiHoursSaved: Math.round(approved * perDraftHours * 10) / 10,
        };
      })
      .sort((a, b) => b.messagesSent - a.messagesSent);

    // Tiles
    const activeUsersThisPeriod = perUser.filter(
      (r) =>
        r.messagesSent > 0 ||
        r.aiDraftsApproved > 0 ||
        r.activeCaseCount > 0,
    ).length;

    const totalCases = perUser.reduce((s, r) => s + r.activeCaseCount, 0);
    const avgCasesPerUser =
      userRows.length > 0
        ? Math.round((totalCases / userRows.length) * 10) / 10
        : 0;

    // Org-wide avg response time
    const avgResponseRow = await db.execute<{ avg_seconds: number | null }>(sql`
      SELECT AVG(response_time_seconds)::float AS avg_seconds
      FROM communications
      WHERE organization_id = ${orgId}
        AND responded_at IS NOT NULL
        AND response_time_seconds IS NOT NULL
        AND responded_at >= ${since.toISOString()}
        AND responded_at <= ${until.toISOString()}
    `);
    const avgSecs = Number(
      (avgResponseRow as unknown as Array<{ avg_seconds: number | null }>)[0]
        ?.avg_seconds ?? 0,
    );
    const avgResponseMinutes =
      avgSecs > 0 ? Math.round((avgSecs / 60) * 10) / 10 : 0;

    // AI-assisted outbound messages count
    const aiAssistedRow = await db
      .select({
        outbound: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound')::int`,
        automated: sql<number>`COUNT(*) FILTER (WHERE ${communications.direction} = 'outbound' AND ${communications.isAutomated} = true)::int`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, orgId),
          gte(communications.createdAt, since),
          lte(communications.createdAt, until),
        ),
      );

    const outboundTotal = Number(aiAssistedRow[0]?.outbound ?? 0);
    const automatedTotal = Number(aiAssistedRow[0]?.automated ?? 0);
    const aiDraftedOutboundPct =
      outboundTotal > 0
        ? Math.round((automatedTotal / outboundTotal) * 100)
        : 0;

    const topUsers = [...perUser]
      .sort((a, b) => b.aiDraftsApproved - a.aiDraftsApproved)
      .slice(0, 3)
      .filter((u) => u.aiDraftsApproved > 0)
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        aiDraftsApproved: u.aiDraftsApproved,
      }));

    return {
      filters: {
        startDate: formatBucket(since),
        endDate: formatBucket(until),
      },
      tiles: {
        activeUsersThisPeriod,
        avgCasesPerUser,
        avgResponseMinutes,
        totalAiAssistedActions: automatedTotal + totalApprovedDrafts,
      },
      perUser,
      aiAdoption: {
        aiDraftedOutboundPct,
        totalAiHoursSaved: aiSavings.hoursSaved,
        topUsers,
      },
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function tableExists(name: string): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(sql`
      SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS exists
    `);
    return Boolean(
      (result as unknown as Array<{ exists: boolean }>)[0]?.exists,
    );
  } catch {
    return false;
  }
}

// Mark imports as intentionally used so tree-shaking doesn't flag them in
// case future code needs the schema bindings directly.
void caseStageTransitions;
void caseRiskScores;
void desc;
