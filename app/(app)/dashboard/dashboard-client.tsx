"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { IntelligenceSection } from "@/components/dashboard/intelligence-section";
import { EvidenceSection } from "@/components/dashboard/evidence-section";
import { ActivitySection } from "@/components/dashboard/activity-section";
import { TrendsSection } from "@/components/dashboard/trends-section";
import { useCountUp } from "@/hooks/use-count-up";
import type { DashboardData } from "@/app/actions/dashboard-data";

type DateRange = "today" | "week" | "month" | "quarter" | "ytd";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "ytd", label: "YTD" },
];

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------
function Sparkline({ path, color }: { path: string; color: string }) {
  const gradientId = `sg-${color.replace("#", "")}`;
  return (
    <div className="w-12 sm:w-16 h-7 sm:h-8 shrink-0 ml-2 sm:ml-3">
      <svg
        viewBox="0 0 64 32"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={`${path} V32 H0 Z`} fill={`url(#${gradientId})`} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card (inline — matches mockup layout with sparkline on right)
// ---------------------------------------------------------------------------
function DashboardStatCard({
  label,
  value,
  trend,
  sparkColor,
  sparkPath,
}: {
  label: string;
  value: string | number;
  trend: { value: number; label: string };
  sparkColor: string;
  sparkPath: string;
}) {
  const isPositive = trend.value >= 0;
  return (
    <div className="bg-card border border-border rounded-md px-3 sm:px-5 py-3 sm:py-4 hover:border-[var(--border-hover,#CCC)] transition-colors duration-200 flex items-center justify-between min-w-0">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1 truncate">
          {label}
        </div>
        <div className="text-[22px] sm:text-[28px] font-semibold font-mono tracking-[-1px] leading-[1.1]">
          {value}
        </div>
        <div className="text-[12px] font-mono mt-1">
          <span className={isPositive ? "text-[#1d72b8]" : "text-[#EE0000]"}>
            {isPositive ? "+" : ""}
            {trend.value}
            {trend.label === "vs prior" ? "%" : ""}
          </span>{" "}
          <span className="text-[#999]">{trend.label}</span>
        </div>
      </div>
      <Sparkline path={sparkPath} color={sparkColor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animated Stat Card (applies count-up to numeric values)
// ---------------------------------------------------------------------------
function AnimatedStatCard({
  label,
  value,
  trend,
  sparkColor,
  sparkPath,
}: {
  label: string;
  value: string | number;
  trend: { value: number; label: string };
  sparkColor: string;
  sparkPath: string;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useCountUp(numericValue);
  const displayValue = typeof value === "number" ? animated : value;

  return (
    <DashboardStatCard
      label={label}
      value={displayValue}
      trend={trend}
      sparkColor={sparkColor}
      sparkPath={sparkPath}
    />
  );
}

// ---------------------------------------------------------------------------
// Urgent Queue
// ---------------------------------------------------------------------------
function UrgentQueue({ items }: { items: DashboardData["urgentItems"] }) {
  const iconClass: Record<string, string> = {
    overdue: "bg-[#FDECEA] text-[#EE0000]",
    warning: "bg-[#FFF3E0] text-[#F5A623]",
    critical: "bg-[#EE0000] text-white",
  };

  return (
    <div className="bg-card border-2 border-destructive rounded-md p-5 hover:border-destructive transition-colors duration-200 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12px] font-medium text-[#EE0000] uppercase tracking-[0.04em]">
          Urgent Attention Queue
        </div>
        <div className="text-[11px] text-[#999] font-mono">
          {items.length} items need attention
        </div>
      </div>
      <ul className="list-none">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 py-3 border-b border-[#F0F0F0] last:border-b-0 text-[13px]"
          >
            <div
              className={`w-5 h-5 min-w-[20px] rounded-full flex items-center justify-center text-[10px] font-bold ${iconClass[item.type] ?? iconClass.warning}`}
            >
              !
            </div>
            <div className="flex-1">
              <strong>{item.text}</strong>{" "}
              <span className="font-mono text-[11px] text-[#0070F3]">
                {item.caseRef}
              </span>
            </div>
            <button className="shrink-0 text-[11px] font-medium text-[#EE0000] border border-[#EE0000] rounded-md px-2 py-[3px] bg-transparent hover:bg-[#EE0000] hover:text-white transition-colors duration-200">
              {item.action}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Funnel
// ---------------------------------------------------------------------------
function PipelineFunnel({ stages }: { stages: DashboardData["funnelStages"] }) {
  return (
    <div className="bg-card border border-border rounded-md p-5 hover:border-[var(--border-hover,#CCC)] transition-colors duration-200">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Pipeline Funnel
      </div>
      <div className="mt-2 space-y-2">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-20 sm:w-[130px] text-right text-[11px] sm:text-[12px] font-mono text-[#666] shrink-0 truncate">
              {stage.label}
            </div>
            <div className="flex-1 h-7 relative">
              <div
                className="h-full rounded-sm flex items-center pl-3 transition-all duration-500"
                style={{
                  width: `${stage.pct}%`,
                  backgroundColor: stage.color,
                }}
              >
                <span className="text-[11px] font-mono font-medium text-white whitespace-nowrap">
                  {stage.count}
                </span>
              </div>
            </div>
            <div className="w-10 text-right text-[11px] font-mono text-[#999] shrink-0">
              {stage.pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win Rate Donut
// ---------------------------------------------------------------------------
function WinRateDonut({ data }: { data: DashboardData["winRate"] }) {
  const circumference = 2 * Math.PI * 56; // r=56
  const wonDash = (data.rate / 100) * circumference;

  return (
    <div className="bg-card border border-border rounded-md p-5 hover:border-[var(--border-hover,#CCC)] transition-colors duration-200">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Overall Win Rate
      </div>
      <div className="flex items-center justify-center gap-6 mt-3">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle
            cx="70"
            cy="70"
            r="56"
            fill="none"
            stroke="#EAEAEA"
            strokeWidth="12"
          />
          <circle
            cx="70"
            cy="70"
            r="56"
            fill="none"
            stroke="#1d72b8"
            strokeWidth="12"
            strokeDasharray={`${wonDash} ${circumference}`}
            strokeDashoffset={-circumference * 0.25}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
          />
          <text
            x="70"
            y="68"
            textAnchor="middle"
            className="font-mono font-semibold text-[28px]"
            fill="#171717"
          >
            {data.rate}%
          </text>
          <text
            x="70"
            y="84"
            textAnchor="middle"
            className="font-mono text-[10px] uppercase tracking-[0.05em]"
            fill="#999"
          >
            WIN RATE
          </text>
        </svg>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12px] font-mono text-[#666]">
            <div className="w-[10px] h-[10px] rounded-sm bg-[#1d72b8]" />
            Won: {data.won}
          </div>
          <div className="flex items-center gap-2 text-[12px] font-mono text-[#666]">
            <div className="w-[10px] h-[10px] rounded-sm bg-[#EE0000]" />
            Denied: {data.denied}
          </div>
          <div className="flex items-center gap-2 text-[12px] font-mono text-[#666]">
            <div className="w-[10px] h-[10px] rounded-sm bg-[#F5A623]" />
            Pending: {data.pending}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Denial Reasons Treemap
// ---------------------------------------------------------------------------
function DenialReasons({
  reasons,
}: {
  reasons: DashboardData["denialReasons"];
}) {
  return (
    <div className="bg-card border border-border rounded-md p-5 hover:border-[var(--border-hover,#CCC)] transition-colors duration-200">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Denial Reasons
      </div>
      <div
        className="grid gap-[3px] h-[180px] grid-cols-2 sm:grid-cols-4"
        style={{
          gridTemplateRows: "auto auto",
        }}
      >
        {reasons.map((r) => (
          <div
            key={r.label}
            className="rounded-sm flex flex-col items-center justify-center p-2 hover:opacity-85 transition-opacity duration-200 cursor-default"
            style={{
              backgroundColor: r.color,
              gridColumn: r.colSpan ? `span ${r.colSpan}` : undefined,
              gridRow: r.rowSpan ? `span ${r.rowSpan}` : undefined,
            }}
          >
            <div className="text-[11px] font-semibold text-white text-center leading-[1.2] whitespace-pre-line">
              {r.label}
            </div>
            <div className="text-[18px] font-bold text-white font-mono mt-[2px]">
              {r.pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appeals Success Rate
// ---------------------------------------------------------------------------
function AppealsSuccess({
  levels,
}: {
  levels: DashboardData["appealsLevels"];
}) {
  const best = levels.reduce((a, b) => (a.pct > b.pct ? a : b));

  return (
    <div className="bg-card border border-border rounded-md p-5 hover:border-[var(--border-hover,#CCC)] transition-colors duration-200">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Appeals Success Rate by Level
      </div>
      <div className="mt-3 space-y-3">
        {levels.map((level) => (
          <div key={level.label} className="flex items-center gap-3">
            <div className="w-20 sm:w-[110px] text-right text-[11px] sm:text-[12px] font-mono text-[#666] shrink-0 truncate">
              {level.label}
            </div>
            <div className="flex-1 h-[26px] bg-[#F7F7F7] rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm flex items-center pl-2 transition-all duration-500"
                style={{
                  width: `${level.pct}%`,
                  backgroundColor: level.color,
                }}
              >
                <span className="text-[11px] font-mono font-medium text-white">
                  {level.pct}%
                </span>
              </div>
            </div>
            <div
              className="w-[44px] text-right text-[12px] font-mono font-medium shrink-0"
              style={{ color: level.color }}
            >
              {level.pct}%
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#666]">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: best.color }}
          />
          Best: {best.label} ({best.pct}%)
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date Range Selector (segmented control)
// ---------------------------------------------------------------------------
function DateRangeSelector({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <div className="flex items-center border border-[#EAEAEA] rounded-md overflow-hidden">
      {DATE_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-[14px] py-[6px] text-[12px] font-normal border-r border-border last:border-r-0 transition-all duration-200 cursor-pointer ${
            value === opt.value
              ? "bg-foreground text-background font-medium"
              : "bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DashboardClient
// ---------------------------------------------------------------------------
export function DashboardClient({ data }: { data: DashboardData }) {
  const [dateRange, setDateRange] = useState<DateRange>("month");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex items-center gap-3">
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
            <Button variant="secondary" size="sm">
              Export
            </Button>
            <Link href="/cases/new">
              <Button size="sm">+ New Case</Button>
            </Link>
          </div>
        }
      />

      {/* Stat Cards — responsive 1/2/3/5 across */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {data.stats.map((stat) => (
          <AnimatedStatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trend={stat.trend}
            sparkColor={stat.sparkColor}
            sparkPath={stat.sparkPath}
          />
        ))}
      </div>

      {/* Urgent Attention Queue */}
      <UrgentQueue items={data.urgentItems} />

      {/* SECTION 1: Pipeline & Outcomes */}
      <div className="mb-8">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999] mb-3 pb-2 border-b border-[#EAEAEA]">
          Pipeline & Outcomes
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
          <PipelineFunnel stages={data.funnelStages} />
          <WinRateDonut data={data.winRate} />
          <DenialReasons reasons={data.denialReasons} />
          <AppealsSuccess levels={data.appealsLevels} />
        </div>
      </div>

      {/* SECTION 2: Intelligence */}
      <RevealOnScroll>
        <IntelligenceSection
          aljApprovalRates={data.aljApprovalRates}
          listingMatchData={data.listingMatchData}
          denialPatterns={data.denialPatterns}
          timeToHearing={data.timeToHearing}
          pastDueProjection={data.pastDueProjection}
          caseComplexity={data.caseComplexity}
        />
      </RevealOnScroll>

      {/* SECTION 3: Evidence & Hearings */}
      <RevealOnScroll>
        <EvidenceSection
          rfcLimitations={data.rfcLimitations}
          ceOutcomes={data.ceOutcomes}
          vocationalExperts={data.vocationalExperts}
          upcomingHearings={data.upcomingHearings}
          clientSatisfaction={data.clientSatisfaction}
        />
      </RevealOnScroll>

      {/* SECTION 4: Activity & Feeds */}
      <RevealOnScroll>
        <ActivitySection
          recentActivity={data.recentActivity}
          recentDecisions={data.recentDecisions}
          teamActivity={data.teamActivity}
          documentQueue={data.documentQueue}
        />
      </RevealOnScroll>

      {/* SECTION 5: Trends */}
      <RevealOnScroll>
        <TrendsSection
          casesByMonth={data.casesByMonth}
          revenueByMonth={data.revenueByMonth}
          taskSparklines={data.taskSparklines}
          weeklyVelocity={data.weeklyVelocity}
        />
      </RevealOnScroll>
    </div>
  );
}
