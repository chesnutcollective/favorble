import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getAljDetail } from "@/app/actions/win-rate-analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { AljTrendChart } from "@/components/charts/alj-trend-chart";
import { OfficeBreakdownChart } from "@/components/charts/office-breakdown-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ALJ Detail",
};

type Params = Promise<{ aljName: string }>;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(mins: number | null): string {
  if (mins === null) return "—";
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export default async function AljDetailPage({ params }: { params: Params }) {
  await requireSession();
  const { aljName: rawName } = await params;
  const aljName = decodeURIComponent(rawName);

  let detail: Awaited<ReturnType<typeof getAljDetail>> = null;
  try {
    detail = await getAljDetail(aljName);
  } catch {
    detail = null;
  }

  if (!detail) {
    notFound();
  }

  const winRatePct = (detail.winRate * 100).toFixed(1);
  const trendData = detail.byQuarter.map((q) => ({
    quarter: q.quarter,
    winRate: q.winRate,
    totalDecisions: q.totalDecisions,
    won: q.won,
    lost: q.lost,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reports/alj-stats"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#666] hover:text-[#263c94] mb-2"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={14}
            color="currentColor"
          />
          Back to all ALJs
        </Link>
        <PageHeader
          title={detail.aljName}
          description="Full hearing history, quarterly trend, and office breakdown."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Hearings"
          value={detail.totalHearings}
          subtitle="All cases"
        />
        <StatsCard
          title="Win Rate"
          value={`${winRatePct}%`}
          subtitle={`${detail.won} won · ${detail.lost} lost`}
        />
        <StatsCard
          title="Decisions"
          value={detail.won + detail.lost}
          subtitle="Closed cases"
        />
        <StatsCard
          title="Avg Duration"
          value={formatDuration(detail.avgDurationMinutes)}
          subtitle="Per hearing"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 bg-white border border-[#EAEAEA] rounded-[10px] p-5">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">
            Win Rate Trend by Quarter
          </h3>
          <AljTrendChart data={trendData} />
        </div>
        <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-[10px] p-5">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">
            Office Breakdown
          </h3>
          <OfficeBreakdownChart data={detail.byOffice} />
        </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
        <div className="p-5 border-b border-[#EAEAEA]">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
            All Cases
          </h3>
          <p className="text-[12px] text-[#666] mt-1">
            {detail.allCases.length} case
            {detail.allCases.length === 1 ? "" : "s"} handled by this ALJ.
          </p>
        </div>
        {detail.allCases.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#666]">
            No cases recorded for this ALJ.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Claimant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hearing Office</TableHead>
                <TableHead className="text-right">Hearing Date</TableHead>
                <TableHead className="text-right">Closed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.allCases.map((c) => {
                const isWon = c.status === "closed_won";
                const isLost = c.status === "closed_lost";
                return (
                  <TableRow key={c.caseId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/cases/${c.caseId}`}
                        className="text-[#263c94] hover:underline"
                      >
                        {c.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[#1a1a1a]">
                      {c.claimantName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border",
                          isWon &&
                            "bg-[#1d72b8]/10 text-[#1d72b8] border-[#1d72b8]/30",
                          isLost &&
                            "bg-[#d1453b]/10 text-[#d1453b] border-[#d1453b]/30",
                          !isWon &&
                            !isLost &&
                            "bg-[#F8F9FC] text-[#666] border-[#EAEAEA]",
                        )}
                      >
                        {isWon
                          ? "Won"
                          : isLost
                            ? "Lost"
                            : c.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#666]">
                      {c.hearingOffice ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {formatDate(c.hearingDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {formatDate(c.closedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
