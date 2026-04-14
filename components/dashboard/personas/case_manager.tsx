import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseRiskScores,
  performanceSnapshots,
  tasks,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import { StreakBadge } from "@/components/dashboard/primitives/streak-badge";
import { WinsTicker } from "@/components/dashboard/primitives/wins-ticker";
import type { SessionUser } from "@/lib/auth/session";

type Props = {
  actor: SessionUser;
};

const accent = PERSONA_ACCENTS.case_manager.accent;

// ── Data loaders (server-side) ─────────────────────────────────────────────

async function loadHeroStats(orgId: string, userId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  try {
    const [activeCasesRow, todayTasksRow, missedRow, comparisonRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, orgId),
            eq(tasks.assignedToId, userId),
            inArray(tasks.status, ["pending", "in_progress"]),
            gte(tasks.dueDate, startOfToday),
            lte(tasks.dueDate, endOfToday),
            isNull(tasks.deletedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, orgId),
            eq(tasks.assignedToId, userId),
            eq(tasks.status, "pending"),
            lte(tasks.dueDate, now),
            gte(tasks.dueDate, new Date(now.getTime() - 7 * 86400000)),
            isNull(tasks.deletedAt),
          ),
        ),
      db
        .select({ avgValue: sql<number>`AVG(${performanceSnapshots.value})::float` })
        .from(performanceSnapshots)
        .where(
          and(
            eq(performanceSnapshots.userId, userId),
            eq(performanceSnapshots.metricKey, "active_cases"),
            gte(performanceSnapshots.periodStart, ninetyDaysAgo),
          ),
        ),
    ]);

    const activeCases = activeCasesRow[0]?.n ?? 0;
    const tasksToday = todayTasksRow[0]?.n ?? 0;
    const missedThisWeek = missedRow[0]?.n ?? 0;
    const avg90d = comparisonRow[0]?.avgValue ?? null;
    const growthFactor =
      avg90d && avg90d > 0 ? Number((activeCases / avg90d).toFixed(2)) : null;

    return { activeCases, tasksToday, missedThisWeek, growthFactor };
  } catch (e) {
    logger.error("case_manager hero stats failed", { error: e });
    return { activeCases: 0, tasksToday: 0, missedThisWeek: 0, growthFactor: null };
  }
}

async function loadActionPile(orgId: string, userId: string) {
  // The "7 cases need you before lunch" insight — group by case_id, anything
  // with: an open task due ≤48h OR an unread urgent inbound msg OR an open
  // supervisor event awaiting review.
  const now = new Date();
  const fortyEightFromNow = new Date(now.getTime() + 48 * 3600 * 1000);

  try {
    const taskRows = await db
      .select({
        caseId: tasks.caseId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        taskId: tasks.id,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assignedToId, userId),
          inArray(tasks.status, ["pending", "in_progress"]),
          lte(tasks.dueDate, fortyEightFromNow),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(tasks.dueDate)
      .limit(20);

    // De-dupe by caseId, keep the soonest task per case
    const seen = new Set<string>();
    const distinct: Array<{
      caseId: string | null;
      title: string;
      dueDate: Date | null;
      priority: string;
      taskId: string;
    }> = [];
    for (const t of taskRows) {
      if (!t.caseId || seen.has(t.caseId)) continue;
      seen.add(t.caseId);
      distinct.push({
        caseId: t.caseId,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        taskId: t.taskId,
      });
      if (distinct.length === 7) break;
    }

    // Hydrate with case context (claimant + risk score)
    if (distinct.length === 0) return [];
    const caseIds = distinct.map((d) => d.caseId).filter((x): x is string => !!x);
    const caseRows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        riskScore: caseRiskScores.score,
      })
      .from(cases)
      .leftJoin(caseRiskScores, eq(caseRiskScores.caseId, cases.id))
      .where(inArray(cases.id, caseIds));
    const caseMap = new Map(caseRows.map((c) => [c.id, c]));

    return distinct.map((d) => ({
      ...d,
      caseNumber: d.caseId ? caseMap.get(d.caseId)?.caseNumber ?? null : null,
      riskScore: d.caseId ? caseMap.get(d.caseId)?.riskScore ?? null : null,
    }));
  } catch (e) {
    logger.error("case_manager action pile failed", { error: e });
    return [];
  }
}

async function loadCaseloadByStage(orgId: string) {
  try {
    const rows = await db
      .select({
        stageId: cases.currentStageId,
        stageName: caseStages.name,
        n: count(),
      })
      .from(cases)
      .leftJoin(caseStages, eq(caseStages.id, cases.currentStageId))
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      )
      .groupBy(cases.currentStageId, caseStages.name)
      .orderBy(desc(count()));
    return rows.map((r) => ({
      label: r.stageName ?? "Unknown",
      count: r.n,
    }));
  } catch (e) {
    logger.error("case_manager caseload by stage failed", { error: e });
    return [];
  }
}

async function loadTopRiskCases(orgId: string, userId: string) {
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        score: caseRiskScores.score,
        band: caseRiskScores.riskBand,
      })
      .from(caseRiskScores)
      .innerJoin(cases, eq(cases.id, caseRiskScores.caseId))
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
          gte(caseRiskScores.score, 50),
        ),
      )
      .orderBy(desc(caseRiskScores.score))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("case_manager risk cases failed", { error: e, userId });
    return [];
  }
}

async function loadTaskBurndown(orgId: string, userId: string) {
  // Last 14 days of task-completion counts per day
  const start = new Date(Date.now() - 14 * 86400000);
  try {
    const rows = await db
      .select({
        day: sql<string>`date_trunc('day', ${tasks.completedAt})::date::text`,
        n: count(),
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assignedToId, userId),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt, start),
        ),
      )
      .groupBy(sql`date_trunc('day', ${tasks.completedAt})`)
      .orderBy(sql`date_trunc('day', ${tasks.completedAt})`);
    // Pad to 14 buckets
    const byDay = new Map(rows.map((r) => [r.day, r.n]));
    const out: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push(byDay.get(key) ?? 0);
    }
    return out;
  } catch (e) {
    logger.error("case_manager burndown failed", { error: e });
    return [];
  }
}

async function loadRecentWins(orgId: string, userId: string) {
  // Recent stage transitions where this user was the actor — proxy for "wins"
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        stage: caseStages.name,
        updatedAt: cases.updatedAt,
      })
      .from(cases)
      .leftJoin(caseStages, eq(caseStages.id, cases.currentStageId))
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(cases.updatedAt))
      .limit(5);
    return rows.map((r) => ({
      id: r.id,
      initials: r.caseNumber ?? "—",
      subtitle: r.stage ?? "Active",
      timestamp: relativeTime(r.updatedAt),
      href: `/cases/${r.id}`,
    }));
  } catch (e) {
    logger.error("case_manager recent wins failed", { error: e, userId });
    return [];
  }
}

function relativeTime(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function tasksDueRelative(d: Date | null): string {
  if (!d) return "no date";
  const diff = new Date(d).getTime() - Date.now();
  if (diff < 0) {
    const overHours = Math.floor(-diff / 3600000);
    return `overdue ${overHours}h`;
  }
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `due in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `due in ${hours}h`;
  return `due in ${Math.floor(hours / 24)}d`;
}

// ── Component ──────────────────────────────────────────────────────────────

export async function CaseManagerDashboard({ actor }: Props) {
  const [hero, pile, byStage, topRisk, burndown, wins] = await Promise.all([
    loadHeroStats(actor.organizationId, actor.id),
    loadActionPile(actor.organizationId, actor.id),
    loadCaseloadByStage(actor.organizationId),
    loadTopRiskCases(actor.organizationId, actor.id),
    loadTaskBurndown(actor.organizationId, actor.id),
    loadRecentWins(actor.organizationId, actor.id),
  ]);

  const maxStageCount = Math.max(1, ...byStage.map((s) => s.count));

  return (
    <div className="space-y-6">
      {/* Hero — multi-stat (Power-User A + Beautiful B merged) */}
      <StatHero
        eyebrow="Your day at a glance"
        stats={[
          {
            label: "Cases needing action before lunch",
            value: pile.length,
            subtitle:
              pile.length > 0
                ? "Resolve these and you're ahead — context-switches are the bottleneck, not task count."
                : "Inbox zero on urgent items. Take the morning to push your medium-risk cases forward.",
            accent,
          },
          { label: "Active cases", value: hero.activeCases },
          { label: "Tasks today", value: hero.tasksToday },
          { label: "Missed (7d)", value: hero.missedThisWeek, accent: hero.missedThisWeek > 0 ? COLORS.bad : COLORS.emerald },
        ]}
        actions={
          <div className="flex flex-col items-end gap-2">
            <StreakBadge
              count={Math.max(0, 7 - hero.missedThisWeek)}
              unit="days"
              description="no missed deadlines"
              broken={hero.missedThisWeek > 0}
            />
            {hero.growthFactor && hero.growthFactor > 1 && (
              <div
                className="text-[11px]"
                style={{ color: COLORS.text2 }}
              >
                You're handling{" "}
                <span style={{ color: COLORS.text1, fontWeight: 600 }}>
                  {hero.growthFactor.toFixed(1)}×
                </span>{" "}
                more cases than 90 days ago
              </div>
            )}
          </div>
        }
      />

      {/* Today — the 7-case decision pile */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Today, in order
        </h2>
        {pile.length === 0 ? (
          <Card>
            <CardContent className="p-2">
              <DashboardEmptyState
                icon="✓"
                title="Inbox zero on urgent items"
                body="Quiet morning — use it to push medium-risk cases forward, or get ahead on the week's deadlines."
                action={{ label: "Open queue", href: "/queue" }}
                accent={accent}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pile.map((row) => {
              const isOverdue = row.dueDate && new Date(row.dueDate).getTime() < Date.now();
              return (
                <TriageCard
                  key={row.taskId}
                  avatar={(row.caseNumber ?? "??").slice(-2)}
                  title={row.title}
                  subtitle={
                    row.caseNumber
                      ? `Case ${row.caseNumber}`
                      : "No case linked"
                  }
                  meta={tasksDueRelative(row.dueDate)}
                  tags={[
                    ...(row.riskScore && row.riskScore >= 70
                      ? [{ label: "Critical", tone: "bad" as const }]
                      : []),
                    ...(isOverdue ? [{ label: "Overdue", tone: "warn" as const }] : []),
                  ]}
                  accent={accent}
                  actions={[
                    { label: "Open case", variant: "primary", href: row.caseId ? `/cases/${row.caseId}` : undefined },
                    { label: "Snooze", variant: "ghost" },
                    { label: "Reassign", variant: "ghost" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Two-column body: caseload bar + right rail (risk pills + wins) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Caseload by stage */}
          <Card>
            <CardContent className="p-5">
              <h3
                className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
                style={{ color: COLORS.text2 }}
              >
                Caseload by Stage
              </h3>
              {byStage.length === 0 ? (
                <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                  No active cases.
                </p>
              ) : (
                <div className="space-y-2">
                  {byStage.map((s) => {
                    const pct = (s.count / maxStageCount) * 100;
                    return (
                      <div key={s.label} className="flex items-center gap-3 text-[12px]">
                        <div className="w-32 truncate" style={{ color: COLORS.text2 }}>
                          {s.label}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-[#F0F3F8] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: accent }}
                          />
                        </div>
                        <div className="w-8 text-right tabular-nums" style={{ color: COLORS.text1 }}>
                          {s.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Task burndown */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-[13px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: COLORS.text2 }}
                >
                  Task Throughput · 14 days
                </h3>
                <div className="text-[12px] tabular-nums" style={{ color: COLORS.text2 }}>
                  {burndown.reduce((a, b) => a + b, 0)} closed
                </div>
              </div>
              {burndown.length > 0 ? (
                <div style={{ color: accent }}>
                  <Sparkline data={burndown} stroke={accent} width={520} height={48} />
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                  No completed tasks in the last 14 days.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {/* Top at-risk cases */}
          <Card>
            <CardContent className="p-5">
              <h3
                className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
                style={{ color: COLORS.text2 }}
              >
                Top At-Risk Cases
              </h3>
              {topRisk.length === 0 ? (
                <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                  No high-risk cases right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {topRisk.map((c) => {
                    const score = c.score ?? 0;
                    const pct = Math.min(100, score);
                    const tone =
                      score >= 86 ? COLORS.bad : score >= 61 ? COLORS.warn : COLORS.ok;
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/cases/${c.id}`}
                          className="flex items-center gap-2 text-[12px] hover:opacity-80"
                        >
                          <span
                            className="font-mono shrink-0"
                            style={{ color: COLORS.text2 }}
                          >
                            #{c.caseNumber ?? "??"}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-[#F0F3F8] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: tone }}
                            />
                          </div>
                          <span
                            className="w-8 text-right tabular-nums"
                            style={{ color: tone }}
                          >
                            {score}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent wins ticker */}
          <WinsTicker
            items={wins}
            title="Recent stage moves"
            todayCount={wins.length}
            height={240}
            emptyMessage="No recent stage transitions"
          />
        </div>
      </div>
    </div>
  );
}
