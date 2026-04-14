import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { db } from "@/db/drizzle";
import { leads } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.intake_agent.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadHeroCounts(orgId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  try {
    const [todayRow, weekConvRow, weekTotalRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, orgId),
            gte(leads.createdAt, startOfToday),
            lte(leads.createdAt, endOfToday),
            isNull(leads.deletedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, orgId),
            gte(leads.convertedAt, startOfWeek),
            isNull(leads.deletedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, orgId),
            gte(leads.createdAt, startOfWeek),
            isNull(leads.deletedAt),
          ),
        ),
    ]);
    const today = todayRow[0]?.n ?? 0;
    const weekConv = weekConvRow[0]?.n ?? 0;
    const weekTotal = weekTotalRow[0]?.n ?? 0;
    const conversionRate = weekTotal > 0 ? Math.round((weekConv / weekTotal) * 100) : 0;
    return { today, weekConv, weekTotal, conversionRate };
  } catch (e) {
    logger.error("intake hero failed", { error: e, orgId });
    return { today: 0, weekConv: 0, weekTotal: 0, conversionRate: 0 };
  }
}

async function loadDecisionPile(orgId: string) {
  // 5 archetype rows: borderline, duplicate-suspected, contract-pending, no-show, new
  try {
    const rows = await db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        status: leads.status,
        pipelineStage: leads.pipelineStage,
        source: leads.source,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          isNull(leads.deletedAt),
          isNull(leads.convertedAt),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("intake decision pile failed", { error: e });
    return [];
  }
}

async function loadPipelineFunnel(orgId: string) {
  try {
    const rows = await db
      .select({
        group: leads.pipelineStageGroup,
        n: count(),
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          isNull(leads.deletedAt),
          isNull(leads.convertedAt),
        ),
      )
      .groupBy(leads.pipelineStageGroup);
    // Order: NEW LEADS / QUALIFICATION / INTAKE / DECISION / CONVERSION
    const order = ["new_leads", "qualification", "intake", "decision", "conversion"];
    return order.map((g) => ({
      label: g.replace("_", " "),
      count: rows.find((r) => r.group === g)?.n ?? 0,
    }));
  } catch (e) {
    logger.error("intake funnel failed", { error: e });
    return [];
  }
}

async function loadSources(orgId: string) {
  try {
    const rows = await db
      .select({ source: leads.source, n: count() })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          isNull(leads.deletedAt),
          gte(leads.createdAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .groupBy(leads.source)
      .orderBy(desc(count()));
    return rows;
  } catch (e) {
    logger.error("intake sources failed", { error: e });
    return [];
  }
}

function ageHours(d: Date | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
}

// ── Component ──────────────────────────────────────────────────────────────

export async function IntakeAgentDashboard({ actor }: Props) {
  const [hero, pile, funnel, sources] = await Promise.all([
    loadHeroCounts(actor.organizationId),
    loadDecisionPile(actor.organizationId),
    loadPipelineFunnel(actor.organizationId),
    loadSources(actor.organizationId),
  ]);

  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));
  const maxSource = Math.max(1, ...sources.map((s) => s.n));

  return (
    <div className="space-y-6">
      {/* Hero — sales-console style: dark navy + count-up + rank pill */}
      <div
        className="rounded-[14px] border p-8 text-white dash-fade-up"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, #050a1e 100%)`,
          borderColor: accent,
        }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.10em] opacity-70 mb-2">
              Today's Intake Floor
            </div>
            <div className="flex items-baseline gap-3">
              <div
                className="font-semibold leading-none tabular-nums"
                style={{ fontSize: 84, letterSpacing: "-0.04em" }}
              >
                {pile.length}
              </div>
              <div className="text-[18px] opacity-80">leads need you</div>
            </div>
            <div className="mt-3 text-[14px] opacity-80">
              {hero.today} new today · {hero.weekConv} converted this week
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.10em] opacity-60">
              Conversion · this week
            </div>
            <div className="text-[40px] font-semibold tabular-nums leading-none mt-1">
              {hero.conversionRate}%
            </div>
            <div className="text-[12px] opacity-70 mt-1">
              {hero.weekConv} / {hero.weekTotal}
            </div>
          </div>
        </div>
      </div>

      {/* Decision pile */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Triage Pile
        </h2>
        {pile.length === 0 ? (
          <Card>
            <CardContent className="p-2">
              <DashboardEmptyState
                icon="🌱"
                title="No leads waiting"
                body="Nice clean pile. New leads will land here as they come in from the website, referral partners, or n8n syncs."
                action={{ label: "Open leads pipeline", href: "/leads" }}
                accent={accent}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pile.slice(0, 6).map((l) => {
              const age = ageHours(l.createdAt);
              const isStale = age > 48;
              // duplicate detection state lives on a different status enum value;
              // check loosely so we don't break if the enum changes.
              const isDup = String(l.status).includes("duplicate");
              return (
                <TriageCard
                  key={l.id}
                  avatar={`${l.firstName[0]}${l.lastName[0]}`}
                  avatarColor={accent}
                  title={`${l.firstName} ${l.lastName}`}
                  subtitle={l.pipelineStage ?? l.status}
                  meta={`${age}h old`}
                  tags={[
                    ...(isDup
                      ? [{ label: "Duplicate", tone: "warn" as const }]
                      : []),
                    ...(isStale
                      ? [{ label: "Stale", tone: "bad" as const }]
                      : []),
                    ...(l.source ? [{ label: l.source, tone: "neutral" as const }] : []),
                  ]}
                  accent={accent}
                  actions={[
                    { label: "Open lead", variant: "primary", href: `/leads/${l.id}` },
                    { label: "Send contract", variant: "ghost" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Pipeline funnel + sources */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Pipeline Funnel
            </h3>
            {funnel.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No leads in pipeline.
              </p>
            ) : (
              <div className="space-y-2">
                {funnel.map((f) => {
                  const pct = (f.count / maxFunnel) * 100;
                  return (
                    <div key={f.label} className="flex items-center gap-3 text-[12px]">
                      <div className="w-32 capitalize" style={{ color: COLORS.text2 }}>
                        {f.label}
                      </div>
                      <div className="flex-1 h-4 rounded-full bg-[#F0F3F8] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: accent }}
                        />
                      </div>
                      <div className="w-10 text-right tabular-nums" style={{ color: COLORS.text1 }}>
                        {f.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Sources · Last 30 Days
            </h3>
            {sources.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No source attribution yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.slice(0, 6).map((s) => {
                  const pct = (s.n / maxSource) * 100;
                  return (
                    <li key={s.source} className="text-[12px]">
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: COLORS.text1 }}>{s.source ?? "—"}</span>
                        <span className="tabular-nums" style={{ color: COLORS.text3 }}>
                          {s.n}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#F0F3F8] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: accent }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/leads"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Triage New Leads
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Open lead pipeline kanban
          </div>
        </Link>
        <Link
          href="/leads?status=contract_sent"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Pending Contracts
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Awaiting signature
          </div>
        </Link>
        <Link
          href="/leads?source=intake_form"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Intake Forms
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Self-serve link · EN/ES
          </div>
        </Link>
      </div>
    </div>
  );
}
