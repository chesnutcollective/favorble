"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatsCard } from "@/components/shared/stats-card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChartLineData01Icon } from "@hugeicons/core-free-icons";
import type {
  NpsOverview,
  NpsResponseRow,
  NpsActionItemRow,
} from "@/app/actions/nps";

type NpsClientProps = {
  overview: NpsOverview | null;
  promoters: NpsResponseRow[];
  passives: NpsResponseRow[];
  detractors: NpsResponseRow[];
  actionItems: NpsActionItemRow[];
  period: string;
  initialTab: string;
};

const VALID_TABS = new Set([
  "overview",
  "promoters",
  "passives",
  "detractors",
  "action-items",
]);

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last year" },
  { value: "0", label: "All time" },
];

export function NpsClient({
  overview,
  promoters,
  passives,
  detractors,
  actionItems,
  period,
  initialTab,
}: NpsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>(
    VALID_TABS.has(initialTab) ? initialTab : "overview",
  );
  const [selectedResponse, setSelectedResponse] =
    useState<NpsResponseRow | null>(null);

  const setPeriod = (next: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("period", next);
    params.set("tab", tab);
    router.push(`/reports/nps?${params.toString()}`);
  };

  const handleTabChange = (next: string) => {
    setTab(next);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    router.replace(`/reports/nps?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#666]">Period:</span>
        {PERIOD_OPTIONS.map((opt) => {
          const active = opt.value === period;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={
                "text-[12px] px-3 py-1.5 rounded-md border transition-colors " +
                (active
                  ? "bg-[#263c94] text-white border-[#263c94]"
                  : "bg-white text-[#555] border-[#EAEAEA] hover:border-[#CCC]")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="promoters">
            Promoters{promoters.length > 0 ? ` (${promoters.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="passives">
            Passives{passives.length > 0 ? ` (${passives.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="detractors">
            Detractors{detractors.length > 0 ? ` (${detractors.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="action-items">
            Action items
            {actionItems.length > 0 ? ` (${actionItems.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <OverviewTab overview={overview} />
        </TabsContent>

        <TabsContent value="promoters" className="space-y-3 pt-4">
          <ResponseList
            rows={promoters}
            onSelect={setSelectedResponse}
            emptyLabel="No promoter responses yet"
          />
        </TabsContent>

        <TabsContent value="passives" className="space-y-3 pt-4">
          <ResponseList
            rows={passives}
            onSelect={setSelectedResponse}
            emptyLabel="No passive responses yet"
          />
        </TabsContent>

        <TabsContent value="detractors" className="space-y-3 pt-4">
          <ResponseList
            rows={detractors}
            onSelect={setSelectedResponse}
            emptyLabel="No detractor responses yet"
          />
        </TabsContent>

        <TabsContent value="action-items" className="space-y-3 pt-4">
          <ActionItemList items={actionItems} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!selectedResponse}
        onOpenChange={(open) => {
          if (!open) setSelectedResponse(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Score: {selectedResponse?.score ?? "—"} ·{" "}
              {selectedResponse?.category ?? ""}
            </DialogTitle>
            <DialogDescription>
              Case {selectedResponse?.caseNumber ?? "—"} ·{" "}
              {selectedResponse?.claimantName ?? "Unknown claimant"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[13px] text-[#444]">
            {selectedResponse?.comment ? (
              <p className="whitespace-pre-wrap">{selectedResponse.comment}</p>
            ) : (
              <p className="text-[#888] italic">No comment provided.</p>
            )}
            <p className="text-[#888] text-[12px]">
              Response detail coming soon.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OverviewTab({ overview }: { overview: NpsOverview | null }) {
  if (!overview || overview.totalResponses === 0) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-6">
        <EmptyState
          icon={ChartLineData01Icon}
          title="No NPS responses yet"
          description="Once surveys start sending in Phase 5, scores and trends will appear here."
        />
      </div>
    );
  }

  const vsBenchmark = overview.npsScore - overview.industryBenchmark;
  const vsBenchmarkLabel =
    vsBenchmark > 0
      ? `+${vsBenchmark} vs industry (${overview.industryBenchmark})`
      : vsBenchmark < 0
        ? `${vsBenchmark} vs industry (${overview.industryBenchmark})`
        : `Matches industry (${overview.industryBenchmark})`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="NPS Score"
          value={overview.npsScore}
          subtitle={vsBenchmarkLabel}
        />
        <StatsCard
          title="Total Responses"
          value={overview.totalResponses}
          subtitle={
            overview.periodDays > 0
              ? `Last ${overview.periodDays} days`
              : "All time"
          }
        />
        <StatsCard
          title="Promoters"
          value={overview.promoters}
          subtitle={`${overview.promoterPct.toFixed(1)}%`}
        />
        <StatsCard
          title="Detractors"
          value={overview.detractors}
          subtitle={`${overview.detractorPct.toFixed(1)}%`}
        />
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-5">
        <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">
          Distribution
        </h3>
        <StackedBar
          promoterPct={overview.promoterPct}
          passivePct={overview.passivePct}
          detractorPct={overview.detractorPct}
        />
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[#666]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#1d72b8]" />
            Promoters ({overview.promoters})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#cf8a00]" />
            Passives ({overview.passives})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#d1453b]" />
            Detractors ({overview.detractors})
          </span>
        </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-5">
        <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">
          Score trend (last 90 days)
        </h3>
        <TrendSparkline trend={overview.trend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommentList
          title="Top positive comments"
          rows={overview.topPositiveComments}
          variant="positive"
        />
        <CommentList
          title="Top negative comments"
          rows={overview.topNegativeComments}
          variant="negative"
        />
      </div>
    </div>
  );
}

function StackedBar({
  promoterPct,
  passivePct,
  detractorPct,
}: {
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
}) {
  return (
    <div className="w-full h-4 rounded-full overflow-hidden bg-[#F0F0F0] flex">
      <div
        className="h-full bg-[#1d72b8]"
        style={{ width: `${promoterPct}%` }}
        title={`Promoters ${promoterPct.toFixed(1)}%`}
      />
      <div
        className="h-full bg-[#cf8a00]"
        style={{ width: `${passivePct}%` }}
        title={`Passives ${passivePct.toFixed(1)}%`}
      />
      <div
        className="h-full bg-[#d1453b]"
        style={{ width: `${detractorPct}%` }}
        title={`Detractors ${detractorPct.toFixed(1)}%`}
      />
    </div>
  );
}

function TrendSparkline({
  trend,
}: {
  trend: { date: string; score: number; responses: number }[];
}) {
  if (trend.length === 0) {
    return (
      <p className="text-[12px] text-[#888] italic">
        Not enough responses to plot a trend yet.
      </p>
    );
  }

  const width = 600;
  const height = 80;
  const scores = trend.map((t) => t.score);
  const min = Math.min(...scores, -20);
  const max = Math.max(...scores, 100);
  const range = Math.max(1, max - min);

  const points = trend
    .map((t, i) => {
      const x =
        trend.length === 1 ? width / 2 : (i / (trend.length - 1)) * width;
      const y = height - ((t.score - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-20"
      preserveAspectRatio="none"
      role="img"
      aria-label="NPS score trend sparkline"
    >
      <polyline fill="none" stroke="#263c94" strokeWidth="2" points={points} />
    </svg>
  );
}

function CommentList({
  title,
  rows,
  variant,
}: {
  title: string;
  rows: { id: string; score: number; comment: string }[];
  variant: "positive" | "negative";
}) {
  const accent = variant === "positive" ? "#1d72b8" : "#d1453b";
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-5">
      <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[#888] italic">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-l-2 pl-3"
              style={{ borderColor: accent }}
            >
              <p className="text-[12px] text-[#888]">Score {r.score}</p>
              <p className="text-[13px] text-[#333] mt-1">"{r.comment}"</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResponseList({
  rows,
  onSelect,
  emptyLabel,
}: {
  rows: NpsResponseRow[];
  onSelect: (row: NpsResponseRow) => void;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-6">
        <EmptyState
          icon={ChartLineData01Icon}
          title={emptyLabel}
          description="Responses appear here once surveys start going out."
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#FAFAFA] border-b border-[#EAEAEA]">
          <tr className="text-[12px] text-[#666] text-left">
            <th className="px-4 py-2 font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Case</th>
            <th className="px-4 py-2 font-medium">Claimant</th>
            <th className="px-4 py-2 font-medium">Comment</th>
            <th className="px-4 py-2 font-medium">Responded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#F8FAFF] cursor-pointer"
              onClick={() => onSelect(row)}
            >
              <td className="px-4 py-2 font-semibold tabular-nums">
                {row.score}
              </td>
              <td className="px-4 py-2">{row.caseNumber ?? "—"}</td>
              <td className="px-4 py-2">{row.claimantName ?? "—"}</td>
              <td className="px-4 py-2 max-w-[360px] truncate text-[#555]">
                {row.comment ? (
                  row.comment
                ) : (
                  <em className="text-[#999]">No comment</em>
                )}
              </td>
              <td className="px-4 py-2 text-[#666]">
                {row.respondedAt
                  ? new Date(row.respondedAt).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionItemList({ items }: { items: NpsActionItemRow[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-6">
        <EmptyState
          icon={ChartLineData01Icon}
          title="No action items"
          description="Detractor follow-ups and escalations will appear here."
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#FAFAFA] border-b border-[#EAEAEA]">
          <tr className="text-[12px] text-[#666] text-left">
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Case</th>
            <th className="px-4 py-2 font-medium">Assignee</th>
            <th className="px-4 py-2 font-medium">Notes</th>
            <th className="px-4 py-2 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-[#F0F0F0] last:border-0"
            >
              <td className="px-4 py-2">
                <StatusPill status={item.status} />
              </td>
              <td className="px-4 py-2 tabular-nums">{item.score ?? "—"}</td>
              <td className="px-4 py-2">{item.caseNumber ?? "—"}</td>
              <td className="px-4 py-2">{item.assigneeName ?? "Unassigned"}</td>
              <td className="px-4 py-2 max-w-[280px] truncate text-[#555]">
                {item.notes ?? <em className="text-[#999]">None</em>}
              </td>
              <td className="px-4 py-2 text-[#666]">
                {new Date(item.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: NpsActionItemRow["status"] }) {
  const styles: Record<NpsActionItemRow["status"], string> = {
    open: "bg-[#FEF3E4] text-[#9A5A00]",
    in_progress: "bg-[#E5EDFB] text-[#263c94]",
    resolved: "bg-[#E4F3E9] text-[#0f6a2a]",
  };
  const label: Record<NpsActionItemRow["status"], string> = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
  };
  return (
    <span
      className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {label[status]}
    </span>
  );
}
