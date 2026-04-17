import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getAllAljStats } from "@/app/actions/win-rate-analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { AljStatsClient } from "./alj-stats-client";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChartLineData01Icon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = {
  title: "ALJ Analytics",
};

export default async function AljStatsPage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getAllAljStats>> = [];
  try {
    rows = await getAllAljStats();
  } catch {
    // DB unavailable
  }

  const totalAljs = rows.length;
  const totalHearings = rows.reduce((sum, r) => sum + r.hearingCount, 0);
  const totalWon = rows.reduce((sum, r) => sum + r.won, 0);
  const totalLost = rows.reduce((sum, r) => sum + r.lost, 0);
  const totalDecisions = totalWon + totalLost;
  const avgWinRate =
    totalDecisions > 0 ? ((totalWon / totalDecisions) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <PageHeader
        title="ALJ Analytics"
        description="Every administrative law judge encountered, with outcome patterns and recent activity."
        actions={
          <Link
            href="/reports/win-rates"
            className="inline-flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-[#EAEAEA] text-[#263c94] hover:border-[#263c94] transition-colors"
          >
            <HugeiconsIcon
              icon={ChartLineData01Icon}
              size={16}
              color="#263c94"
              aria-hidden="true"
            />
            Win Rate Analytics
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="ALJs Tracked" value={totalAljs} />
        <StatsCard
          title="Total Hearings"
          value={totalHearings}
          subtitle="All time"
        />
        <StatsCard
          title="Decisions"
          value={totalDecisions}
          subtitle={`${totalWon} won · ${totalLost} lost`}
        />
        <StatsCard
          title="Avg Win Rate"
          value={`${avgWinRate}%`}
          subtitle="Across all ALJs"
        />
      </div>

      <AljStatsClient rows={rows} />
    </div>
  );
}
