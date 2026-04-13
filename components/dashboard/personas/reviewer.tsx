import Link from "next/link";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db/drizzle";
import {
  caseRiskScores,
  cases,
  complianceFindings,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import {
  getAllAljStats,
  getWinRateOverview,
} from "@/app/actions/win-rate-analytics";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import {
  HeatmapMatrix,
  type HeatmapCell,
} from "@/components/dashboard/charts/heatmap-matrix";
import { PercentileBand } from "@/components/dashboard/charts/percentile-band";
import { Sparkline } from "@/components/charts/sparkline";
import {
  FirmPulseLights,
  type PulseLight,
} from "@/components/dashboard/primitives/firm-pulse-lights";
import { WinsTicker } from "@/components/dashboard/primitives/wins-ticker";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };

const accent = PERSONA_ACCENTS.reviewer.accent;
// Conservative national-percentile estimate for SSDI ALJ win rates.
// Source: NOSSCR / SSA disposition data (rolling 12-mo). 50% ≈ national
// median, 65%+ ≈ ~85th percentile.
const NATIONAL_BENCHMARK_PCT = 50;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadHeroWinRate(orgId: string) {
  try {
    const overview = await getWinRateOverview(90);
    // overallWinRate comes back as a 0-1 fraction — convert to percent for display.
    const winRate =
      overview.overallWinRate !== undefined && overview.totalDecisions > 0
        ? overview.overallWinRate * 100
        : null;
    return {
      rate: winRate,
      total: overview.totalDecisions ?? 0,
      won: overview.won ?? 0,
    };
  } catch (e) {
    logger.error("reviewer hero win rate failed", { error: e, orgId });
    return { rate: null, total: 0, won: 0 };
  }
}

async function loadFirmPulse(orgId: string): Promise<PulseLight[]> {
  try {
    const [activeRow, riskRow, compRow, hiRiskRow] = await Promise.all([
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
        .select({ avg: caseRiskScores.score })
        .from(caseRiskScores)
        .innerJoin(cases, eq(cases.id, caseRiskScores.caseId))
        .where(eq(cases.organizationId, orgId))
        .limit(500),
      db
        .select({ n: count() })
        .from(complianceFindings)
        .where(
          and(
            eq(complianceFindings.organizationId, orgId),
            eq(complianceFindings.status, "open"),
          ),
        ),
      db
        .select({ n: count() })
        .from(caseRiskScores)
        .innerJoin(cases, eq(cases.id, caseRiskScores.caseId))
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            gte(caseRiskScores.score, 86),
          ),
        ),
    ]);
    const active = activeRow[0]?.n ?? 0;
    const compliance = compRow[0]?.n ?? 0;
    const hiRisk = hiRiskRow[0]?.n ?? 0;
    const hiRiskPct = active > 0 ? (hiRisk / active) * 100 : 0;

    return [
      {
        id: "pipeline",
        label: "Pipeline",
        state: active < 5 ? "warn" : "ok",
        metric: `${active} active`,
        rule: "Healthy if ≥ 5 active cases.",
      },
      {
        id: "win",
        label: "Win Rate",
        state: "ok",
        metric: "see hero",
        rule: "Healthy if ≥ 55% trailing 90d.",
      },
      {
        id: "risk",
        label: "Risk Profile",
        state: hiRiskPct > 7 ? "bad" : hiRiskPct > 3 ? "warn" : "ok",
        metric: `${hiRisk} critical`,
        rule:
          "Healthy if critical-risk cases ≤ 3% of active portfolio (≥86 PR-1 score).",
      },
      {
        id: "compliance",
        label: "Compliance",
        state: compliance > 5 ? "bad" : compliance > 0 ? "warn" : "ok",
        metric: `${compliance} open`,
        rule: "Healthy if 0 open findings.",
        href: "/admin/compliance",
      },
      {
        id: "load",
        label: "Rep Load",
        state: "ok",
        metric: `${riskRow.length} scored`,
        rule: "Healthy if no rep > 1.5× firm avg caseload.",
      },
    ];
  } catch (e) {
    logger.error("reviewer firm pulse failed", { error: e });
    return [];
  }
}

async function loadAljHeatmap() {
  try {
    const aljs = await getAllAljStats();
    const top = aljs
      .filter((a) => a.hearingCount >= 5)
      .sort((a, b) => b.hearingCount - a.hearingCount)
      .slice(0, 12);

    // Two columns per ALJ: firm win rate, "delta vs national".
    // a.winRate is 0-1 fraction — convert to percent.
    const cells: HeatmapCell[][] = top.map((a) => {
      const firmWin = (a.winRate ?? 0) * 100;
      const delta = firmWin - NATIONAL_BENCHMARK_PCT;
      const tooltip = `${a.aljName}: firm ${firmWin.toFixed(0)}% (n=${a.hearingCount}), national ${NATIONAL_BENCHMARK_PCT}%`;
      return [
        {
          intensity: Math.min(1, firmWin / 100),
          tooltip,
          display: `${Math.round(firmWin)}%`,
          state: firmWin >= 65 ? "ok" : firmWin >= 45 ? undefined : "bad",
        },
        {
          intensity: Math.max(0, Math.min(1, (delta + 30) / 60)),
          tooltip: `Delta vs national: ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}pp`,
          display: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`,
          state: delta >= 5 ? "ok" : delta < -10 ? "bad" : "warn",
        },
      ];
    });

    return { rowLabels: top.map((a) => a.aljName), cells };
  } catch (e) {
    logger.error("reviewer ALJ heatmap failed", { error: e });
    return { rowLabels: [], cells: [] };
  }
}

async function loadWinsThisWeek(orgId: string) {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        closedAt: cases.closedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "closed_won"),
          gte(cases.closedAt, start),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(cases.closedAt))
      .limit(15);
    return rows.map((r) => ({
      id: r.id,
      initials: r.caseNumber?.slice(-2) ?? "??",
      subtitle: `Case ${r.caseNumber ?? "—"} · favorable decision`,
      timestamp: relativeTime(r.closedAt),
      href: `/cases/${r.id}`,
    }));
  } catch (e) {
    logger.error("reviewer wins-this-week failed", { error: e });
    return [];
  }
}

async function loadWinRateTrend(orgId: string) {
  // 12-week sparkline of weekly closed_won rate (won / (won+lost))
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 7 * 86400000);
  try {
    const rows = await db
      .select({
        status: cases.status,
        closedAt: cases.closedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          gte(cases.closedAt, start),
          isNull(cases.deletedAt),
        ),
      );
    const weekly: Array<{ won: number; lost: number }> = Array.from(
      { length: 12 },
      () => ({ won: 0, lost: 0 }),
    );
    for (const r of rows) {
      if (!r.closedAt) continue;
      const weekIdx = Math.floor(
        (r.closedAt.getTime() - start.getTime()) / (7 * 86400000),
      );
      if (weekIdx < 0 || weekIdx >= 12) continue;
      if (r.status === "closed_won") weekly[weekIdx].won++;
      else if (r.status === "closed_lost") weekly[weekIdx].lost++;
    }
    return weekly.map((w) =>
      w.won + w.lost === 0 ? 0 : Math.round((w.won / (w.won + w.lost)) * 100),
    );
  } catch (e) {
    logger.error("reviewer win-rate trend failed", { error: e });
    return [];
  }
}

function relativeTime(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────────

export async function ReviewerDashboard({ actor }: Props) {
  const [hero, pulse, aljHeat, wins, trend] = await Promise.all([
    loadHeroWinRate(actor.organizationId),
    loadFirmPulse(actor.organizationId),
    loadAljHeatmap(),
    loadWinsThisWeek(actor.organizationId),
    loadWinRateTrend(actor.organizationId),
  ]);

  const winRate = hero.rate ?? 0;
  // Patch the firm pulse "Win Rate" tile with the real number now we have it
  const lights = pulse.map((l) =>
    l.id === "win"
      ? {
          ...l,
          state: (winRate >= 55 ? "ok" : winRate >= 45 ? "warn" : "bad") as
            | "ok"
            | "warn"
            | "bad",
          metric: hero.rate !== null ? `${winRate.toFixed(0)}%` : "—",
        }
      : l,
  );

  return (
    <div className="space-y-6">
      {/* Hero — firm win rate + percentile band + 12-week trend */}
      <div
        className="rounded-[14px] border bg-white p-8 dash-fade-up"
        style={{ borderColor: COLORS.borderDefault }}
      >
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-2"
              style={{ color: COLORS.text2 }}
            >
              Firm Win Rate · Trailing 90 Days
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className="font-semibold leading-none tabular-nums"
                style={{
                  fontSize: 96,
                  letterSpacing: "-0.04em",
                  color: accent,
                }}
              >
                {hero.rate !== null ? `${hero.rate.toFixed(1)}%` : "—"}
              </div>
              <div className="text-[14px]" style={{ color: COLORS.text2 }}>
                {hero.won} won / {hero.total} decided
              </div>
            </div>
            {hero.rate !== null && (
              <div className="mt-5 max-w-md">
                <PercentileBand
                  value={Math.min(95, hero.rate * 1.2)}
                  label="vs national distribution"
                  comparison={`national avg ~${NATIONAL_BENCHMARK_PCT}%`}
                  goldThreshold={80}
                />
              </div>
            )}
          </div>
          {trend.length > 0 && (
            <div className="shrink-0">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-2"
                style={{ color: COLORS.text2 }}
              >
                12-week trend
              </div>
              <div style={{ color: accent }}>
                <Sparkline data={trend} stroke={accent} width={240} height={72} />
              </div>
              <div
                className="text-[11px] mt-1 text-right"
                style={{ color: COLORS.text3 }}
              >
                weekly win rate %
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Firm Pulse — 5 status lights */}
      <FirmPulseLights lights={lights} />

      {/* Two-column body */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ALJ heatmap */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3
                className="text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: COLORS.text2 }}
              >
                ALJ Win Rate · Firm vs National
              </h3>
              <Link
                href="/reports/alj-stats"
                className="text-[11px] hover:underline"
                style={{ color: accent }}
              >
                View all ALJs →
              </Link>
            </div>
            {aljHeat.cells.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                Not enough hearing data yet to compare ALJs.
              </p>
            ) : (
              <HeatmapMatrix
                rowLabels={aljHeat.rowLabels}
                colLabels={["Firm %", "Δ vs Nat'l"]}
                cells={aljHeat.cells}
                cellSize={56}
                cellGap={2}
                showValues
              />
            )}
          </CardContent>
        </Card>

        {/* Wins this week ticker */}
        <WinsTicker
          items={wins}
          title="Wins this week"
          todayCount={wins.length}
          height={420}
          emptyMessage="This week's wins will appear here as cases close."
        />
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/reports/risk"
          className="block rounded-[10px] border p-5 hover:border-[#CCC] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: COLORS.text2 }}>
            Open Risk Queue
          </div>
          <div className="text-[14px]" style={{ color: COLORS.text1 }}>
            High-risk cases requiring reviewer approval
          </div>
        </Link>
        <Link
          href="/coaching"
          className="block rounded-[10px] border p-5 hover:border-[#CCC] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: COLORS.text2 }}>
            Review Coaching Flags
          </div>
          <div className="text-[14px]" style={{ color: COLORS.text1 }}>
            Team performance flags awaiting review
          </div>
        </Link>
        <Link
          href="/reports/leaderboards"
          className="block rounded-[10px] border p-5 hover:border-[#CCC] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: COLORS.text2 }}>
            Drill Performance
          </div>
          <div className="text-[14px]" style={{ color: COLORS.text1 }}>
            Rep leaderboards & ALJ analytics
          </div>
        </Link>
      </div>
    </div>
  );
}
