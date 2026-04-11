"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseAssignments,
  calendarEvents,
  tasks,
  users,
  leads,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  and,
  eq,
  gte,
  lte,
  lt,
  isNull,
  isNotNull,
  inArray,
  sql,
  desc,
  ne,
} from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HeadlineMetrics = {
  activeCases: number;
  wonThisMonth: number;
  winRate90d: number;
  openHearingsThisWeek: number;
  avgTimeToHearingDays: number;
  revenuePlaceholder: number;
  revenueNote: string;
};

export type HearingForecastWeek = {
  weekStart: string; // ISO date string YYYY-MM-DD
  count: number;
};

export type RepPerformanceRow = {
  id: string;
  name: string;
  activeCases: number;
  hearingsThisMonth: number;
  winRate: number; // 0-100
  avgCaseAgeDays: number;
  hoursLogged: number;
};

export type TeamHealth = {
  team: string;
  openTasks: number;
  overdueTasks: number;
  completedThisWeek: number;
  memberCount: number;
};

export type RiskAlert = {
  caseId: string;
  caseNumber: string;
  claimant: string;
  alertType:
    | "overdue_tasks"
    | "missing_phi_sheet"
    | "hearing_no_docs"
    | "missing_mr";
  alertMessage: string;
  severity: "high" | "medium" | "low";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d: Date): Date {
  // Monday as start of week
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // days since Monday
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// getHeadlineMetrics
// ---------------------------------------------------------------------------

export async function getHeadlineMetrics(): Promise<HeadlineMetrics> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const ninetyDaysAgo = addDays(now, -90);
  const weekFromNow = addDays(now, 7);

  try {
    const [
      activeCasesRes,
      wonThisMonthRes,
      won90Res,
      lost90Res,
      hearingsWeekRes,
      avgHearingRes,
    ] = await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "closed_won"),
            gte(cases.closedAt, monthStart),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "closed_won"),
            gte(cases.closedAt, ninetyDaysAgo),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "closed_lost"),
            gte(cases.closedAt, ninetyDaysAgo),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.organizationId, orgId),
            eq(calendarEvents.eventType, "hearing"),
            gte(calendarEvents.startAt, now),
            lte(calendarEvents.startAt, weekFromNow),
            isNull(calendarEvents.deletedAt),
          ),
        ),
      db
        .select({
          avgDays: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${calendarEvents.startAt} - ${cases.createdAt})) / 86400), 0)::float`,
        })
        .from(cases)
        .innerJoin(
          calendarEvents,
          and(
            eq(calendarEvents.caseId, cases.id),
            eq(calendarEvents.eventType, "hearing"),
          ),
        )
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            isNull(calendarEvents.deletedAt),
          ),
        ),
    ]);

    const won90 = won90Res[0]?.c ?? 0;
    const lost90 = lost90Res[0]?.c ?? 0;
    const winRate90d =
      won90 + lost90 > 0 ? Math.round((won90 / (won90 + lost90)) * 100) : 0;

    return {
      activeCases: activeCasesRes[0]?.c ?? 0,
      wonThisMonth: wonThisMonthRes[0]?.c ?? 0,
      winRate90d,
      openHearingsThisWeek: hearingsWeekRes[0]?.c ?? 0,
      avgTimeToHearingDays: Math.round(avgHearingRes[0]?.avgDays ?? 0),
      revenuePlaceholder: 0,
      revenueNote: "billing integration pending",
    };
  } catch {
    return {
      activeCases: 0,
      wonThisMonth: 0,
      winRate90d: 0,
      openHearingsThisWeek: 0,
      avgTimeToHearingDays: 0,
      revenuePlaceholder: 0,
      revenueNote: "billing integration pending",
    };
  }
}

// ---------------------------------------------------------------------------
// getHearingForecast
// ---------------------------------------------------------------------------

export async function getHearingForecast(): Promise<HearingForecastWeek[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const now = new Date();
  const weekZero = startOfWeek(now);
  const forecastEnd = addDays(weekZero, 12 * 7);

  // Seed 12 weeks with zero counts
  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    buckets.set(formatISODate(addDays(weekZero, i * 7)), 0);
  }

  try {
    const rows = await db
      .select({
        startAt: calendarEvents.startAt,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, orgId),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, weekZero),
          lt(calendarEvents.startAt, forecastEnd),
          isNull(calendarEvents.deletedAt),
        ),
      );

    for (const r of rows) {
      if (!r.startAt) continue;
      const bucket = formatISODate(startOfWeek(new Date(r.startAt)));
      if (buckets.has(bucket)) {
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      }
    }
  } catch {
    // DB unavailable — return zeros
  }

  return Array.from(buckets.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ---------------------------------------------------------------------------
// getRepPerformance
// ---------------------------------------------------------------------------

export async function getRepPerformance(): Promise<RepPerformanceRow[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const now = new Date();
  const monthStart = startOfMonth(now);

  try {
    const attorneys = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          eq(users.role, "attorney"),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    if (attorneys.length === 0) return [];

    const attorneyIds = attorneys.map((a) => a.id);

    // Active cases per rep (via assignments)
    const activeCasesRows = await db
      .select({
        userId: caseAssignments.userId,
        c: sql<number>`count(distinct ${cases.id})::int`,
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
      .where(
        and(
          inArray(caseAssignments.userId, attorneyIds),
          isNull(caseAssignments.unassignedAt),
        ),
      )
      .groupBy(caseAssignments.userId);

    // Avg case age per rep (active cases)
    const avgAgeRows = await db
      .select({
        userId: caseAssignments.userId,
        avgDays: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - ${cases.createdAt})) / 86400), 0)::float`,
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
      .where(
        and(
          inArray(caseAssignments.userId, attorneyIds),
          isNull(caseAssignments.unassignedAt),
        ),
      )
      .groupBy(caseAssignments.userId);

    // Hearings this month per rep: events linked to cases assigned to rep
    const hearingsMonthRows = await db
      .select({
        userId: caseAssignments.userId,
        c: sql<number>`count(distinct ${calendarEvents.id})::int`,
      })
      .from(caseAssignments)
      .innerJoin(
        calendarEvents,
        and(
          eq(calendarEvents.caseId, caseAssignments.caseId),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, monthStart),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .where(
        and(
          inArray(caseAssignments.userId, attorneyIds),
          isNull(caseAssignments.unassignedAt),
        ),
      )
      .groupBy(caseAssignments.userId);

    // Win rate per rep
    const winRateRows = await db
      .select({
        userId: caseAssignments.userId,
        won: sql<number>`count(distinct case when ${cases.status} = 'closed_won' then ${cases.id} end)::int`,
        lost: sql<number>`count(distinct case when ${cases.status} = 'closed_lost' then ${cases.id} end)::int`,
      })
      .from(caseAssignments)
      .innerJoin(
        cases,
        and(
          eq(caseAssignments.caseId, cases.id),
          inArray(cases.status, ["closed_won", "closed_lost"]),
          isNull(cases.deletedAt),
        ),
      )
      .where(inArray(caseAssignments.userId, attorneyIds))
      .groupBy(caseAssignments.userId);

    const activeMap = new Map(activeCasesRows.map((r) => [r.userId, r.c]));
    const ageMap = new Map(avgAgeRows.map((r) => [r.userId, r.avgDays]));
    const hearingsMap = new Map(hearingsMonthRows.map((r) => [r.userId, r.c]));
    const wrMap = new Map(
      winRateRows.map((r) => [r.userId, { won: r.won, lost: r.lost }]),
    );

    return attorneys
      .map<RepPerformanceRow>((a) => {
        const wr = wrMap.get(a.id);
        const winRate =
          wr && wr.won + wr.lost > 0
            ? Math.round((wr.won / (wr.won + wr.lost)) * 100)
            : 0;
        return {
          id: a.id,
          name: `${a.firstName} ${a.lastName}`,
          activeCases: activeMap.get(a.id) ?? 0,
          hearingsThisMonth: hearingsMap.get(a.id) ?? 0,
          winRate,
          avgCaseAgeDays: Math.round(ageMap.get(a.id) ?? 0),
          hoursLogged: 0, // no time tracking in current schema
        };
      })
      .sort((a, b) => b.activeCases - a.activeCases);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getTeamHealth
// ---------------------------------------------------------------------------

const TEAMS = [
  "intake",
  "filing",
  "medical_records",
  "mail_sorting",
  "case_management",
  "hearings",
  "administration",
] as const;

export async function getTeamHealth(): Promise<TeamHealth[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const now = new Date();
  const weekStart = startOfWeek(now);

  try {
    // Team membership counts
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

    const memberMap = new Map(memberRows.map((r) => [r.team as string, r.c]));

    // For each team, resolve tasks via assignee's team
    const openTaskRows = await db
      .select({
        team: users.team,
        c: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(
        and(
          eq(tasks.organizationId, orgId),
          inArray(tasks.status, ["pending", "in_progress"]),
          isNull(tasks.deletedAt),
          isNotNull(users.team),
        ),
      )
      .groupBy(users.team);

    const overdueTaskRows = await db
      .select({
        team: users.team,
        c: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(
        and(
          eq(tasks.organizationId, orgId),
          inArray(tasks.status, ["pending", "in_progress"]),
          isNotNull(tasks.dueDate),
          lt(tasks.dueDate, now),
          isNull(tasks.deletedAt),
          isNotNull(users.team),
        ),
      )
      .groupBy(users.team);

    const completedRows = await db
      .select({
        team: users.team,
        c: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt, weekStart),
          isNull(tasks.deletedAt),
          isNotNull(users.team),
        ),
      )
      .groupBy(users.team);

    const openMap = new Map(openTaskRows.map((r) => [r.team as string, r.c]));
    const overdueMap = new Map(
      overdueTaskRows.map((r) => [r.team as string, r.c]),
    );
    const completedMap = new Map(
      completedRows.map((r) => [r.team as string, r.c]),
    );

    return TEAMS.map<TeamHealth>((team) => ({
      team,
      openTasks: openMap.get(team) ?? 0,
      overdueTasks: overdueMap.get(team) ?? 0,
      completedThisWeek: completedMap.get(team) ?? 0,
      memberCount: memberMap.get(team) ?? 0,
    }));
  } catch {
    return TEAMS.map((team) => ({
      team,
      openTasks: 0,
      overdueTasks: 0,
      completedThisWeek: 0,
      memberCount: 0,
    }));
  }
}

// ---------------------------------------------------------------------------
// getRiskAlerts
// ---------------------------------------------------------------------------

export async function getRiskAlerts(): Promise<RiskAlert[]> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const now = new Date();
  const hearingCutoff = addDays(now, 14);

  const alerts: RiskAlert[] = [];

  try {
    // 1. Overdue tasks - cases with 3+ overdue tasks
    const overdueCases = await db
      .select({
        caseId: tasks.caseId,
        caseNumber: cases.caseNumber,
        firstName: leads.firstName,
        lastName: leads.lastName,
        c: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(cases, eq(tasks.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(tasks.organizationId, orgId),
          inArray(tasks.status, ["pending", "in_progress"]),
          isNotNull(tasks.dueDate),
          lt(tasks.dueDate, now),
          eq(cases.status, "active"),
          isNull(tasks.deletedAt),
          isNull(cases.deletedAt),
        ),
      )
      .groupBy(tasks.caseId, cases.caseNumber, leads.firstName, leads.lastName)
      .having(sql`count(*) >= 3`)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    for (const row of overdueCases) {
      alerts.push({
        caseId: row.caseId,
        caseNumber: row.caseNumber,
        claimant:
          [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
        alertType: "overdue_tasks",
        alertMessage: `${row.c} overdue tasks`,
        severity: row.c >= 6 ? "high" : row.c >= 4 ? "medium" : "low",
      });
    }

    // 2. Missing PHI sheet — active cases in unassigned status
    const missingPhi = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        firstName: leads.firstName,
        lastName: leads.lastName,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          eq(cases.phiSheetStatus, "unassigned"),
          isNotNull(cases.hearingDate),
          lt(cases.hearingDate, addDays(now, 60)),
          isNull(cases.deletedAt),
        ),
      )
      .limit(20);

    for (const row of missingPhi) {
      alerts.push({
        caseId: row.caseId,
        caseNumber: row.caseNumber,
        claimant:
          [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
        alertType: "missing_phi_sheet",
        alertMessage: "PHI sheet unassigned — hearing <60 days",
        severity: "high",
      });
    }

    // 3. Hearing <14 days with no PHI started
    const hearingNoDocs = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        firstName: leads.firstName,
        lastName: leads.lastName,
        hearingDate: cases.hearingDate,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNotNull(cases.hearingDate),
          gte(cases.hearingDate, now),
          lt(cases.hearingDate, hearingCutoff),
          ne(cases.phiSheetStatus, "complete"),
          isNull(cases.deletedAt),
        ),
      )
      .limit(20);

    for (const row of hearingNoDocs) {
      alerts.push({
        caseId: row.caseId,
        caseNumber: row.caseNumber,
        claimant:
          [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
        alertType: "hearing_no_docs",
        alertMessage: "Hearing <14 days, PHI not complete",
        severity: "high",
      });
    }

    // 4. Missing MR — cases in mr_status pending/missing
    const missingMr = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        firstName: leads.firstName,
        lastName: leads.lastName,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          inArray(cases.mrStatus, ["pending", "missing", "incomplete"]),
          isNull(cases.deletedAt),
        ),
      )
      .limit(20);

    for (const row of missingMr) {
      alerts.push({
        caseId: row.caseId,
        caseNumber: row.caseNumber,
        claimant:
          [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
        alertType: "missing_mr",
        alertMessage: "Medical records incomplete",
        severity: "medium",
      });
    }
  } catch {
    // DB unavailable
  }

  // Sort: high > medium > low
  const severityRank = { high: 0, medium: 1, low: 2 };
  return alerts.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );
}

// ---------------------------------------------------------------------------
// Aggregated data fetcher for page
// ---------------------------------------------------------------------------

export type ExecDashboardData = {
  headline: HeadlineMetrics;
  forecast: HearingForecastWeek[];
  reps: RepPerformanceRow[];
  teams: TeamHealth[];
  alerts: RiskAlert[];
};

export async function getExecDashboardData(): Promise<ExecDashboardData> {
  const [headline, forecast, reps, teams, alerts] = await Promise.all([
    getHeadlineMetrics(),
    getHearingForecast(),
    getRepPerformance(),
    getTeamHealth(),
    getRiskAlerts(),
  ]);

  return { headline, forecast, reps, teams, alerts };
}
