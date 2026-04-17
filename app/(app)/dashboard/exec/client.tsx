"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  AlertCircleIcon,
  Clock01Icon,
  FileNotFoundIcon,
  StethoscopeIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import type {
  ExecDashboardData,
  HeadlineMetrics,
  HearingForecastWeek,
  RepPerformanceRow,
  TeamHealth,
  RiskAlert,
} from "@/app/actions/exec-dashboard";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const BRAND = "#263c94";
const POS = "#1d72b8";
const WARN = "#cf8a00";
const URGENT = "#d1453b";
const SURFACE = "#F8F9FC";
const BRAND_TINT = "rgba(38,60,148,0.08)";
const BRAND_BORDER = "rgba(38,60,148,0.13)";

// Weekly hearing capacity line (approx. 37 reps x modest throughput)
const WEEKLY_CAPACITY = 35;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtWeekLabel(iso: string): string {
  // iso like YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TEAM_LABELS: Record<string, string> = {
  intake: "Intake",
  filing: "Filing",
  medical_records: "Medical Records",
  mail_sorting: "Mail",
  case_management: "Case Mgmt",
  hearings: "Hearings",
  administration: "Admin",
};

// ---------------------------------------------------------------------------
// Hero card (Section 1)
// ---------------------------------------------------------------------------
function HeroCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "default" | "warning" | "urgent" | "positive";
}) {
  const accentColor =
    accent === "warning"
      ? WARN
      : accent === "urgent"
        ? URGENT
        : accent === "positive"
          ? POS
          : BRAND;

  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-2"
      style={{
        background: BRAND_TINT,
        borderColor: BRAND_BORDER,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(38,60,148,0.06)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "#6e6e80" }}
      >
        {label}
      </div>
      <div
        className="font-semibold tabular-nums leading-[1.05] tracking-[-0.03em]"
        style={{ fontSize: 34, color: accentColor }}
      >
        {value}
      </div>
      {sublabel ? (
        <div className="text-[11px] tabular-nums" style={{ color: "#8b8b97" }}>
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function HeadlineSection({ metrics }: { metrics: HeadlineMetrics }) {
  return (
    <section>
      <SectionHeader label="Headline Metrics" />
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <HeroCard
          label="Active Cases"
          value={fmtNum(metrics.activeCases)}
          sublabel="current portfolio"
        />
        <HeroCard
          label="Won This Month"
          value={fmtNum(metrics.wonThisMonth)}
          sublabel="closed favorable"
          accent="positive"
        />
        <HeroCard
          label="Win Rate (90d)"
          value={`${metrics.winRate90d}%`}
          sublabel="won / decided"
          accent="positive"
        />
        <HeroCard
          label="Hearings This Week"
          value={fmtNum(metrics.openHearingsThisWeek)}
          sublabel="next 7 days"
          accent={
            metrics.openHearingsThisWeek > WEEKLY_CAPACITY
              ? "urgent"
              : "default"
          }
        />
        <HeroCard
          label="Avg Time to Hearing"
          value={`${metrics.avgTimeToHearingDays}d`}
          sublabel="case creation → hearing"
        />
        <HeroCard
          label="Revenue"
          value="—"
          sublabel={metrics.revenueNote}
          accent="warning"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <div className="mb-3 pb-2 border-b border-[#EAEAEA]">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "#6e6e80" }}
      >
        {label}
      </div>
      {description ? (
        <div className="text-[12px] mt-1" style={{ color: "#8b8b97" }}>
          {description}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Hearing Forecast
// ---------------------------------------------------------------------------
function ForecastSection({ forecast }: { forecast: HearingForecastWeek[] }) {
  const chartData = forecast.map((w) => ({
    week: fmtWeekLabel(w.weekStart),
    count: w.count,
  }));

  const total = forecast.reduce((s, w) => s + w.count, 0);
  const overCapacity = forecast.filter((w) => w.count > WEEKLY_CAPACITY).length;

  return (
    <section>
      <SectionHeader
        label="Hearing Forecast — Next 12 Weeks"
        description={`${total} hearings scheduled · capacity line ${WEEKLY_CAPACITY}/week`}
      />
      <div
        className="rounded-[10px] border p-5"
        style={{
          background: SURFACE,
          borderColor: BRAND_BORDER,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(38,60,148,0.06)",
        }}
      >
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, bottom: 0, left: -10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(38,60,148,0.08)"
                vertical={false}
              />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: "#52525e" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(38,60,148,0.13)" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#52525e" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(38,60,148,0.13)" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: `1px solid ${BRAND_BORDER}`,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "DM Sans, sans-serif",
                }}
                labelStyle={{ color: "#18181a", fontWeight: 600 }}
                cursor={{ fill: "rgba(38,60,148,0.04)" }}
              />
              <ReferenceLine
                y={WEEKLY_CAPACITY}
                stroke={URGENT}
                strokeDasharray="4 4"
                label={{
                  value: `capacity ${WEEKLY_CAPACITY}`,
                  position: "right",
                  fill: URGENT,
                  fontSize: 10,
                  fontFamily: "DM Sans, sans-serif",
                }}
              />
              <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {overCapacity > 0 ? (
          <div
            className="mt-3 text-[12px] flex items-center gap-2"
            style={{ color: URGENT }}
          >
            <HugeiconsIcon icon={Alert01Icon} size={14} aria-hidden="true" />
            <span className="font-medium">
              {overCapacity} week{overCapacity === 1 ? "" : "s"} over capacity
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Rep Performance (sortable table)
// ---------------------------------------------------------------------------
type RepSortKey = keyof Omit<RepPerformanceRow, "id">;

function RepPerformanceSection({ reps }: { reps: RepPerformanceRow[] }) {
  const [sortKey, setSortKey] = useState<RepSortKey>("activeCases");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...reps];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av ?? 0);
      const bn = Number(bv ?? 0);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return arr;
  }, [reps, sortKey, sortDir]);

  const toggleSort = (key: RepSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const columns: { key: RepSortKey; label: string; align: "left" | "right" }[] =
    [
      { key: "name", label: "Attorney", align: "left" },
      { key: "activeCases", label: "Active Cases", align: "right" },
      { key: "hearingsThisMonth", label: "Hearings MTD", align: "right" },
      { key: "winRate", label: "Win Rate", align: "right" },
      { key: "avgCaseAgeDays", label: "Avg Case Age", align: "right" },
    ];

  return (
    <section>
      <SectionHeader
        label="Rep Performance"
        description={`${reps.length} attorneys · click any column to sort`}
      />
      <div
        className="rounded-[10px] border overflow-hidden"
        style={{
          background: "#fff",
          borderColor: BRAND_BORDER,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(38,60,148,0.06)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: SURFACE }}>
                {columns.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={`px-4 py-3 font-semibold text-[10.5px] uppercase tracking-[0.07em] cursor-pointer select-none ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                      style={{
                        color: active ? BRAND : "#6e6e80",
                        borderBottom: `1px solid ${BRAND_BORDER}`,
                      }}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {active ? (
                        <span className="ml-1 tabular-nums">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-[13px]"
                    style={{ color: "#8b8b97" }}
                  >
                    No attorneys found.
                  </td>
                </tr>
              ) : (
                sorted.map((rep, i) => (
                  <tr
                    key={rep.id}
                    className="hover:bg-[rgba(38,60,148,0.03)] transition-colors"
                    style={{
                      borderBottom:
                        i === sorted.length - 1
                          ? "none"
                          : "1px solid rgba(38,60,148,0.06)",
                    }}
                  >
                    <td
                      className="px-4 py-3 font-medium"
                      style={{ color: "#18181a" }}
                    >
                      {rep.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(rep.activeCases)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(rep.hearingsThisMonth)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        style={{
                          color:
                            rep.winRate >= 60
                              ? POS
                              : rep.winRate >= 40
                                ? "#18181a"
                                : WARN,
                          fontWeight: 500,
                        }}
                      >
                        {rep.winRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rep.avgCaseAgeDays}d
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Team Health
// ---------------------------------------------------------------------------
function TeamCard({ team }: { team: TeamHealth }) {
  const label = TEAM_LABELS[team.team] ?? team.team;
  const overdueColor = team.overdueTasks > 0 ? URGENT : "#8b8b97";

  return (
    <div
      className="rounded-[10px] border p-4 flex flex-col gap-3"
      style={{
        background: "#fff",
        borderColor: BRAND_BORDER,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(38,60,148,0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold" style={{ color: "#18181a" }}>
          {label}
        </div>
        <div
          className="text-[10px] px-2 py-[2px] rounded-[4px] tabular-nums font-semibold"
          style={{
            background: BRAND_TINT,
            color: BRAND,
          }}
        >
          {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "#8b8b97" }}
          >
            Open
          </div>
          <div
            className="text-[22px] font-semibold tabular-nums leading-tight"
            style={{ color: "#18181a" }}
          >
            {fmtNum(team.openTasks)}
          </div>
        </div>
        <div>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "#8b8b97" }}
          >
            Overdue
          </div>
          <div
            className="text-[22px] font-semibold tabular-nums leading-tight"
            style={{ color: overdueColor }}
          >
            {fmtNum(team.overdueTasks)}
          </div>
        </div>
        <div>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "#8b8b97" }}
          >
            Done 7d
          </div>
          <div
            className="text-[22px] font-semibold tabular-nums leading-tight"
            style={{ color: POS }}
          >
            {fmtNum(team.completedThisWeek)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamHealthSection({ teams }: { teams: TeamHealth[] }) {
  return (
    <section>
      <SectionHeader
        label="Team Health"
        description="Tasks and capacity across all operational teams"
      />
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {teams.map((t) => (
          <TeamCard key={t.team} team={t} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Risk Alerts
// ---------------------------------------------------------------------------
function alertIcon(type: RiskAlert["alertType"]) {
  switch (type) {
    case "overdue_tasks":
      return Clock01Icon;
    case "missing_phi_sheet":
      return FileNotFoundIcon;
    case "hearing_no_docs":
      return AlertCircleIcon;
    case "missing_mr":
      return StethoscopeIcon;
    default:
      return Alert01Icon;
  }
}

function severityStyle(sev: RiskAlert["severity"]) {
  if (sev === "high")
    return { bg: "rgba(209,69,59,0.10)", color: URGENT, label: "High" };
  if (sev === "medium")
    return { bg: "rgba(207,138,0,0.10)", color: WARN, label: "Medium" };
  return { bg: "rgba(29,114,184,0.10)", color: POS, label: "Low" };
}

const ALERT_TYPE_LABELS: Record<RiskAlert["alertType"], string> = {
  overdue_tasks: "Overdue Tasks",
  missing_phi_sheet: "PHI Sheet",
  hearing_no_docs: "Hearing Prep",
  missing_mr: "Medical Records",
};

function RiskAlertsSection({ alerts }: { alerts: RiskAlert[] }) {
  return (
    <section>
      <SectionHeader
        label="Risk Alerts"
        description={`${alerts.length} case${alerts.length === 1 ? "" : "s"} require attention`}
      />
      <div
        className="rounded-[10px] border overflow-hidden"
        style={{
          background: "#fff",
          borderColor: BRAND_BORDER,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 3px rgba(38,60,148,0.06)",
        }}
      >
        {alerts.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-[13px]"
            style={{ color: "#8b8b97" }}
          >
            No active risk alerts.
          </div>
        ) : (
          <ul>
            {alerts.slice(0, 50).map((a, i) => {
              const sev = severityStyle(a.severity);
              return (
                <li
                  key={`${a.caseId}-${a.alertType}-${i}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(38,60,148,0.03)] transition-colors"
                  style={{
                    borderBottom:
                      i === Math.min(alerts.length, 50) - 1
                        ? "none"
                        : "1px solid rgba(38,60,148,0.06)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0"
                    style={{ background: sev.bg, color: sev.color }}
                  >
                    <HugeiconsIcon icon={alertIcon(a.alertType)} size={14} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-medium text-[13px] truncate"
                        style={{ color: "#18181a" }}
                      >
                        {a.claimant}
                      </span>
                      <span
                        className="text-[11px] tabular-nums px-[6px] py-[1px] rounded-[4px]"
                        style={{ background: BRAND_TINT, color: BRAND }}
                      >
                        {a.caseNumber}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.06em] px-[6px] py-[1px] rounded-[4px]"
                        style={{ background: "#F0F0F0", color: "#6e6e80" }}
                      >
                        {ALERT_TYPE_LABELS[a.alertType]}
                      </span>
                    </div>
                    <div
                      className="text-[12px] mt-[2px]"
                      style={{ color: "#52525e" }}
                    >
                      {a.alertMessage}
                    </div>
                  </div>
                  <Badge
                    className="shrink-0 text-[10px] uppercase tracking-[0.06em] border-transparent"
                    style={{ background: sev.bg, color: sev.color }}
                  >
                    {sev.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function ExecDashboardClient({ data }: { data: ExecDashboardData }) {
  return (
    <div
      className="space-y-8"
      style={{
        fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
      }}
    >
      <PageHeader
        title="Executive Dashboard"
        description="Unified leadership view across the firm"
      />

      <HeadlineSection metrics={data.headline} />
      <ForecastSection forecast={data.forecast} />
      <RepPerformanceSection reps={data.reps} />
      <TeamHealthSection teams={data.teams} />
      <RiskAlertsSection alerts={data.alerts} />
    </div>
  );
}
