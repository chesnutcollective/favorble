import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { calendarEvents, cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { ProgressRing } from "@/components/dashboard/charts/progress-ring";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };

const accent = PERSONA_ACCENTS.attorney.accent;

type Hearing = {
  id: string;
  caseId: string | null;
  caseNumber: string | null;
  start: Date;
  alj: string | null;
  mode: string | null;
  prepStatus: "ready" | "partial" | "not_ready";
};

// ── Data loaders ───────────────────────────────────────────────────────────

async function loadUpcomingHearings(orgId: string): Promise<Hearing[]> {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  try {
    const rows = await db
      .select({
        eventId: calendarEvents.id,
        caseId: calendarEvents.caseId,
        start: calendarEvents.startAt,
        title: calendarEvents.title,
        description: calendarEvents.description,
        caseNumber: cases.caseNumber,
        alj: cases.adminLawJudge,
        mrStatus: cases.mrStatus,
        phiSheetStatus: cases.phiSheetStatus,
      })
      .from(calendarEvents)
      .leftJoin(cases, eq(cases.id, calendarEvents.caseId))
      .where(
        and(
          eq(calendarEvents.organizationId, orgId),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, now),
          lte(calendarEvents.startAt, sevenDays),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .orderBy(calendarEvents.startAt)
      .limit(20);

    return rows.map((r) => {
      const desc = `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      const mode = desc.includes("video")
        ? "video"
        : desc.includes("phone")
          ? "phone"
          : desc.includes("in-person") || desc.includes("in person")
            ? "in_person"
            : null;
      const phiOk = r.phiSheetStatus === "complete";
      const mrOk = r.mrStatus === "complete";
      const prepStatus: Hearing["prepStatus"] =
        phiOk && mrOk ? "ready" : phiOk || mrOk ? "partial" : "not_ready";
      return {
        id: r.eventId,
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        start: r.start,
        alj: r.alj,
        mode,
        prepStatus,
      };
    });
  } catch (e) {
    logger.error("attorney hearings load failed", { error: e });
    return [];
  }
}

async function loadWinRate(orgId: string) {
  const start = new Date(Date.now() - 90 * 86400000);
  try {
    const [wonRow, lostRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "closed_won"),
            gte(cases.closedAt, start),
            isNull(cases.deletedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "closed_lost"),
            gte(cases.closedAt, start),
            isNull(cases.deletedAt),
          ),
        ),
    ]);
    const won = wonRow[0]?.n ?? 0;
    const lost = lostRow[0]?.n ?? 0;
    const total = won + lost;
    if (total === 0) return { rate: null, won, lost, total };
    return { rate: Math.round((won / total) * 100), won, lost, total };
  } catch (e) {
    logger.error("attorney win rate failed", { error: e });
    return { rate: null, won: 0, lost: 0, total: 0 };
  }
}

async function loadOutcomePulse(orgId: string) {
  // Last 30 closed cases — won/lost dot pattern
  try {
    const rows = await db
      .select({ status: cases.status, closedAt: cases.closedAt })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          sql`${cases.status} IN ('closed_won','closed_lost')`,
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(cases.closedAt))
      .limit(30);
    return rows.map((r) => (r.status === "closed_won" ? "won" : "lost"));
  } catch (e) {
    logger.error("attorney outcome pulse failed", { error: e });
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDay(d: Date): string {
  const date = new Date(d);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function countdownTo(d: Date): string {
  const diff = new Date(d).getTime() - Date.now();
  if (diff <= 0) return "Now";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) return `in ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function prepPercent(prepStatus: Hearing["prepStatus"]): number {
  return prepStatus === "ready" ? 100 : prepStatus === "partial" ? 50 : 10;
}

// ── Component ──────────────────────────────────────────────────────────────

export async function AttorneyDashboard({ actor }: Props) {
  const [hearings, win, pulse] = await Promise.all([
    loadUpcomingHearings(actor.organizationId),
    loadWinRate(actor.organizationId),
    loadOutcomePulse(actor.organizationId),
  ]);

  // Today's hearings (filter further)
  const todayCutoff = new Date();
  todayCutoff.setHours(23, 59, 59, 999);
  const todays = hearings.filter((h) => new Date(h.start) <= todayCutoff);
  const notReadyToday = todays.filter((h) => h.prepStatus !== "ready").length;
  const next = hearings[0];
  const nextPrep = next ? prepPercent(next.prepStatus) : 0;

  const wins = pulse.filter((p) => p === "won").length;
  const losses = pulse.length - wins;

  return (
    <div className="space-y-6">
      {/* Hero — Readiness Monolith (indigo card) */}
      <div
        className="rounded-[14px] border p-8 dash-fade-up"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, #0f0e2c 100%)`,
          color: "#F5F5F7",
          borderColor: accent,
        }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.10em] opacity-70 mb-3">
              Today's Docket
            </div>
            <div
              className="font-semibold leading-none tabular-nums mb-2"
              style={{ fontSize: 64, letterSpacing: "-0.04em" }}
            >
              {todays.length === 0
                ? "0 hearings today"
                : notReadyToday === 0
                  ? `${todays.length} ready`
                  : `${notReadyToday} of ${todays.length} NOT READY`}
            </div>
            {next && (
              <div className="text-[14px] opacity-80">
                Next: {next.caseNumber ? `Case ${next.caseNumber}` : "Hearing"}{" "}
                · {fmtDay(next.start)} {fmtTime(next.start)}{" "}
                {next.alj && `· ALJ ${next.alj}`}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            {next && (
              <ProgressRing
                value={nextPrep}
                size={88}
                strokeWidth={8}
                color="#ffffff"
                trackColor="rgba(255,255,255,0.35)"
                centerLabel={countdownTo(next.start)}
                centerSubtitle="next hearing"
              />
            )}
            {win.rate !== null && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.10em] opacity-60">
                  Win rate · 90d
                </div>
                <div className="text-[28px] font-semibold tabular-nums">
                  {win.rate}%
                </div>
                <div className="text-[11px] opacity-70">
                  {win.won} / {win.total}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today's docket strip */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Today & Tomorrow
        </h2>
        {todays.length === 0 && hearings.length === 0 ? (
          <Card>
            <CardContent className="p-2">
              <DashboardEmptyState
                icon="⚖"
                title="No hearings in the next 7 days"
                body="A good day to review past losses or prep ahead. Open the hearings workspace to see your full docket."
                action={{ label: "Open hearings", href: "/hearings" }}
                accent={accent}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {hearings.slice(0, 6).map((h) => {
              const tone =
                h.prepStatus === "ready" ? "ok" : h.prepStatus === "partial" ? "warn" : "bad";
              return (
                <TriageCard
                  key={h.id}
                  avatar={(h.alj ?? "AL").slice(0, 2)}
                  avatarColor={accent}
                  title={
                    h.caseNumber ? `Case ${h.caseNumber}` : "Hearing"
                  }
                  subtitle={`${fmtDay(h.start)} ${fmtTime(h.start)}${h.mode ? ` · ${h.mode.replace("_", "-")}` : ""}`}
                  meta={countdownTo(h.start)}
                  tags={[
                    {
                      label:
                        h.prepStatus === "ready"
                          ? "Ready"
                          : h.prepStatus === "partial"
                            ? "Partial"
                            : "Not Ready",
                      tone: tone as "ok" | "warn" | "bad",
                    },
                  ]}
                  body={
                    h.alj ? (
                      <div className="text-[12px]" style={{ color: COLORS.text2 }}>
                        <span className="opacity-70">ALJ</span> {h.alj}
                      </div>
                    ) : null
                  }
                  countdownPercent={prepPercent(h.prepStatus)}
                  countdownLabel={`${prepPercent(h.prepStatus)}%`}
                  accent={accent}
                  actions={
                    h.prepStatus !== "ready"
                      ? [
                          {
                            label: "Generate brief",
                            variant: "primary",
                            href: h.caseId ? `/hearings/${h.caseId}` : undefined,
                          },
                        ]
                      : [
                          {
                            label: "Open workspace",
                            variant: "primary",
                            href: h.caseId ? `/hearings/${h.caseId}` : undefined,
                          },
                        ]
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Lower band: outcome pulse + win rate stats + this week */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Outcome Pulse · Last {pulse.length} closed
            </h3>
            {pulse.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No closed cases yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {pulse.map((outcome, i) => (
                    <span
                      key={i}
                      className="h-3 w-3 rounded-full"
                      style={{
                        background: outcome === "won" ? COLORS.emerald : COLORS.bad,
                      }}
                      title={outcome}
                    />
                  ))}
                </div>
                <div className="flex gap-4 text-[12px]" style={{ color: COLORS.text2 }}>
                  <span>
                    <span style={{ color: COLORS.emerald }}>● {wins} won</span>
                  </span>
                  <span>
                    <span style={{ color: COLORS.bad }}>● {losses} lost</span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Hearings · Next 7 days
            </h3>
            <div
              className="text-[40px] font-semibold leading-none tabular-nums"
              style={{ color: COLORS.text1 }}
            >
              {hearings.length}
            </div>
            <div className="text-[12px] mt-1" style={{ color: COLORS.text2 }}>
              {hearings.filter((h) => h.mode === "video").length} video ·{" "}
              {hearings.filter((h) => h.mode === "in_person").length} in-person ·{" "}
              {hearings.filter((h) => h.mode === "phone").length} phone
            </div>
            <Link
              href="/hearings"
              className="text-[12px] mt-3 inline-block hover:underline"
              style={{ color: accent }}
            >
              Open hearings workspace →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
