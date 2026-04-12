import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getWinRateOverview,
  getWinRatesByDimension,
  type WinRateDimension,
} from "@/app/actions/win-rate-analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { WinRateFilterBar } from "./filter-bar";
import { WinRateByDimensionChart } from "@/components/charts/win-rate-by-dimension-chart";
import { WinRateTable } from "./win-rate-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { JusticeScale01Icon, Award01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Win Rate Analytics",
};

const VALID_PERIODS = new Set(["30", "90", "180", "365", "0"]);
const VALID_DIMENSIONS = new Set<WinRateDimension>([
  "rep",
  "alj",
  "office",
  "hearing_type",
]);

const DIMENSION_LABELS: Record<WinRateDimension, string> = {
  rep: "Rep",
  alj: "ALJ",
  office: "Hearing Office",
  hearing_type: "Hearing Type",
};

type SearchParams = Promise<{
  period?: string;
  dimension?: string;
}>;

export default async function WinRatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const rawPeriod = sp.period ?? "365";
  const period = VALID_PERIODS.has(rawPeriod) ? rawPeriod : "365";
  const periodDays = Number(period);

  const rawDimension = (sp.dimension ?? "rep") as WinRateDimension;
  const dimension = VALID_DIMENSIONS.has(rawDimension) ? rawDimension : "rep";

  let overview: Awaited<ReturnType<typeof getWinRateOverview>> = {
    overallWinRate: 0,
    totalDecisions: 0,
    won: 0,
    lost: 0,
    periodDays,
  };
  let rows: Awaited<ReturnType<typeof getWinRatesByDimension>> = [];

  try {
    const [o, r] = await Promise.all([
      getWinRateOverview(periodDays),
      getWinRatesByDimension(dimension, periodDays),
    ]);
    overview = o;
    rows = r;
  } catch {
    // DB unavailable — render empty state
  }

  const overallPct = (overview.overallWinRate * 100).toFixed(1);
  const chartData = rows.map((r) => ({
    name: r.name,
    winRate: r.winRate,
    totalDecisions: r.totalDecisions,
    won: r.won,
    lost: r.lost,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Win Rate Analytics"
        description="Hearing outcomes broken down by rep, ALJ, office, and hearing type."
        actions={
          <Link
            href="/reports/alj-stats"
            className="inline-flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-[#EAEAEA] text-[#263c94] hover:border-[#263c94] transition-colors"
          >
            <HugeiconsIcon
              icon={JusticeScale01Icon}
              size={16}
              color="#263c94"
            />
            ALJ Analytics
          </Link>
        }
      />

      <WinRateFilterBar period={period} dimension={dimension} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Overall Win Rate"
          value={`${overallPct}%`}
          subtitle={
            overview.totalDecisions > 0
              ? `${overview.won} of ${overview.totalDecisions} decisions`
              : "No decisions"
          }
        />
        <StatsCard
          title="Total Decisions"
          value={overview.totalDecisions}
          subtitle={periodDays > 0 ? `Last ${periodDays} days` : "All time"}
        />
        <StatsCard
          title="Cases Won"
          value={overview.won}
          subtitle="Closed favorably"
        />
        <StatsCard
          title="Cases Lost"
          value={overview.lost}
          subtitle="Closed unfavorably"
        />
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-5">
        <div className="flex items-center gap-2 mb-4">
          <HugeiconsIcon icon={Award01Icon} size={18} color="#263c94" />
          <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
            Win Rate by {DIMENSION_LABELS[dimension]}
          </h3>
        </div>
        <WinRateByDimensionChart data={chartData} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#666]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#1d72b8]" />
            60%+ (strong)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#cf8a00]" />
            40–60% (mixed)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#d1453b]" />
            Below 40%
          </span>
        </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
        <div className="p-5 border-b border-[#EAEAEA]">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
            Detailed Breakdown
          </h3>
          <p className="text-[12px] text-[#666] mt-1">
            Sortable — click any column header.
          </p>
        </div>
        <WinRateTable
          rows={rows}
          dimensionLabel={DIMENSION_LABELS[dimension]}
        />
      </div>
    </div>
  );
}
