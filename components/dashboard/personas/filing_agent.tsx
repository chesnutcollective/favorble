import Link from "next/link";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { ereJobs, cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import { LiveTicker, type TickerItem } from "@/components/dashboard/primitives/live-ticker";
import { Sparkline } from "@/components/charts/sparkline";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.filing_agent.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadFilingHero(orgId: string) {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  try {
    const [ytdRow, todayRow, queueRow, errorsRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(ereJobs)
        .where(
          and(
            eq(ereJobs.status, "completed"),
            gte(ereJobs.completedAt, ytdStart),
          ),
        ),
      db
        .select({ n: count() })
        .from(ereJobs)
        .where(
          and(
            eq(ereJobs.status, "completed"),
            gte(ereJobs.completedAt, todayStart),
          ),
        ),
      db
        .select({ n: count() })
        .from(ereJobs)
        .where(
          sql`${ereJobs.status} IN ('queued','running','pending_review')`,
        ),
      db
        .select({ n: count() })
        .from(ereJobs)
        .where(
          and(
            eq(ereJobs.status, "failed"),
            gte(ereJobs.createdAt, new Date(Date.now() - 7 * 86400000)),
          ),
        ),
    ]);
    return {
      ytd: ytdRow[0]?.n ?? 0,
      today: todayRow[0]?.n ?? 0,
      queue: queueRow[0]?.n ?? 0,
      errors: errorsRow[0]?.n ?? 0,
    };
  } catch (e) {
    logger.error("filing hero failed", { error: e, orgId });
    return { ytd: 0, today: 0, queue: 0, errors: 0 };
  }
}

async function loadQaQueue(orgId: string) {
  try {
    const rows = await db
      .select({
        id: ereJobs.id,
        jobType: ereJobs.jobType,
        status: ereJobs.status,
        caseId: ereJobs.caseId,
        createdAt: ereJobs.createdAt,
        caseNumber: cases.caseNumber,
      })
      .from(ereJobs)
      .leftJoin(cases, eq(cases.id, ereJobs.caseId))
      .where(
        sql`${ereJobs.status} IN ('queued','pending_review','running')`,
      )
      .orderBy(desc(ereJobs.createdAt))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("filing qa queue failed", { error: e });
    return [];
  }
}

async function loadThroughput(orgId: string) {
  // 14-day daily filings completed
  const start = new Date(Date.now() - 14 * 86400000);
  try {
    const rows = await db
      .select({
        day: sql<string>`date_trunc('day', ${ereJobs.completedAt})::date::text`,
        n: count(),
      })
      .from(ereJobs)
      .where(
        and(
          eq(ereJobs.status, "completed"),
          gte(ereJobs.completedAt, start),
        ),
      )
      .groupBy(sql`date_trunc('day', ${ereJobs.completedAt})`)
      .orderBy(sql`date_trunc('day', ${ereJobs.completedAt})`);
    const byDay = new Map(rows.map((r) => [r.day, r.n]));
    const out: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      out.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
    }
    return out;
  } catch (e) {
    logger.error("filing throughput failed", { error: e });
    return [];
  }
}

async function loadAcceptanceTicker(orgId: string): Promise<TickerItem[]> {
  try {
    const rows = await db
      .select({
        id: ereJobs.id,
        jobType: ereJobs.jobType,
        status: ereJobs.status,
        completedAt: ereJobs.completedAt,
        caseNumber: cases.caseNumber,
      })
      .from(ereJobs)
      .leftJoin(cases, eq(cases.id, ereJobs.caseId))
      .where(gte(ereJobs.createdAt, new Date(Date.now() - 24 * 3600000)))
      .orderBy(desc(ereJobs.createdAt))
      .limit(30);
    return rows.map((r) => ({
      id: r.id,
      tone:
        r.status === "completed"
          ? ("ok" as const)
          : r.status === "failed"
            ? ("bad" as const)
            : ("info" as const),
      label: `${r.caseNumber ?? "ERE"} · ${r.jobType}`,
      detail: r.status,
    }));
  } catch (e) {
    logger.error("filing ticker failed", { error: e });
    return [];
  }
}

function ageHours(d: Date | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
}

// ── Component ──────────────────────────────────────────────────────────────

export async function FilingAgentDashboard({ actor }: Props) {
  const [hero, queue, throughput, ticker] = await Promise.all([
    loadFilingHero(actor.organizationId),
    loadQaQueue(actor.organizationId),
    loadThroughput(actor.organizationId),
    loadAcceptanceTicker(actor.organizationId),
  ]);

  const totalThroughput = throughput.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Acceptance ticker */}
      {ticker.length > 0 && (
        <LiveTicker
          items={ticker}
          height={28}
          background="rgba(20,40,30,0.92)"
          className="rounded-[8px] overflow-hidden"
        />
      )}

      {/* Scoreboard hero */}
      <StatHero
        eyebrow="Submissions QA · Year to Date"
        stats={[
          {
            label: "Filings completed YTD",
            value: hero.ytd,
            subtitle: `${hero.today} today · ${hero.queue} in QA queue · ${hero.errors} errors past 7d`,
            accent,
          },
          { label: "In QA queue", value: hero.queue },
          {
            label: "Errors (7d)",
            value: hero.errors,
            accent: hero.errors > 0 ? COLORS.bad : COLORS.emerald,
          },
        ]}
      />

      {/* QA queue card stack */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          QA Queue · Approve / Reject
        </h2>
        {queue.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-[13px]" style={{ color: COLORS.text2 }}>
              QA queue is empty — pipeline is humming.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {queue.map((q) => {
              const age = ageHours(q.createdAt);
              const overdue = age > 4;
              return (
                <TriageCard
                  key={q.id}
                  avatar={(q.caseNumber ?? "??").slice(-2)}
                  avatarColor={accent}
                  title={q.caseNumber ? `Case ${q.caseNumber}` : "ERE Job"}
                  subtitle={q.jobType}
                  meta={`${age}h old`}
                  tags={[
                    {
                      label: q.status,
                      tone: q.status === "running" ? "info" : "neutral",
                    },
                    ...(overdue ? [{ label: "Overdue", tone: "warn" as const }] : []),
                  ]}
                  accent={accent}
                  actions={[
                    {
                      label: "Open job",
                      variant: "primary",
                      href: q.caseId ? `/cases/${q.caseId}` : `/admin/integrations`,
                    },
                    { label: "Approve", variant: "ghost" },
                    { label: "Reject", variant: "danger" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Throughput + leverage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3
                className="text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: COLORS.text2 }}
              >
                Filing Throughput · 14 days
              </h3>
              <div className="text-[12px] tabular-nums" style={{ color: COLORS.text2 }}>
                {totalThroughput} completed
              </div>
            </div>
            {throughput.length > 0 ? (
              <div style={{ color: accent }}>
                <Sparkline data={throughput} stroke={accent} width={520} height={48} />
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No completed filings in the last 14 days.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Leverage · AI vs Manual
            </h3>
            <div
              className="text-[40px] font-semibold leading-none tabular-nums"
              style={{ color: accent }}
            >
              ~{Math.round(hero.ytd * 0.7)}h
            </div>
            <div className="text-[12px] mt-1" style={{ color: COLORS.text2 }}>
              human-hours saved YTD vs manual baseline
            </div>
            <div className="text-[11px] mt-3" style={{ color: COLORS.text3 }}>
              Estimated at 0.7h saved per AI-prepared filing reviewed.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
