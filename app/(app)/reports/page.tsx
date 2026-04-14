import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import {
  getFirmInsights,
  type InsightsAggregation,
} from "@/app/actions/firm-insights";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StackedBar } from "@/components/charts/stacked-bar";
import { ReportNavigationTiles } from "@/components/charts/report-navigation-tiles";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Reports",
};

type SearchParams = Promise<{
  practiceArea?: string;
  userId?: string;
  aggregation?: string;
  range?: string;
  start?: string;
  end?: string;
}>;

const RANGE_PRESETS: Array<{
  key: string;
  label: string;
  days: number | null;
}> = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "ytd", label: "YTD", days: null },
  { key: "all", label: "All", days: 3650 },
];

const AGG_OPTIONS: InsightsAggregation[] = ["day", "week", "month", "year"];

function resolveRange(
  rangeKey: string | undefined,
  startParam: string | undefined,
  endParam: string | undefined,
): { start: string; end: string; rangeKey: string } {
  const today = new Date();
  const endStr = today.toISOString().slice(0, 10);

  // Custom range takes precedence when both are provided
  if (startParam && endParam) {
    return { start: startParam, end: endParam, rangeKey: "custom" };
  }

  const key = rangeKey ?? "30d";
  const preset = RANGE_PRESETS.find((r) => r.key === key) ?? RANGE_PRESETS[1];

  if (preset.key === "ytd") {
    const jan1 = new Date(today.getFullYear(), 0, 1);
    return {
      start: jan1.toISOString().slice(0, 10),
      end: endStr,
      rangeKey: preset.key,
    };
  }

  const days = preset.days ?? 30;
  const start = new Date(today.getTime() - days * 86400 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: endStr,
    rangeKey: preset.key,
  };
}

function buildQs(
  base: {
    practiceArea?: string | null;
    userId?: string | null;
    aggregation?: string;
    range?: string;
    start?: string;
    end?: string;
  },
  overrides: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (typeof v === "string" && v.length > 0) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const aggregation: InsightsAggregation = AGG_OPTIONS.includes(
    sp.aggregation as InsightsAggregation,
  )
    ? (sp.aggregation as InsightsAggregation)
    : "week";

  const { start, end, rangeKey } = resolveRange(sp.range, sp.start, sp.end);

  const insights = await getFirmInsights({
    practiceArea: sp.practiceArea ?? null,
    userId: sp.userId ?? null,
    aggregation,
    startDate: start,
    endDate: end,
  });

  const {
    tiles,
    casesOverTime,
    outcomeMix,
    stageThroughput,
    atRiskShare,
    practiceAreas,
    userOptions,
  } = insights;

  const baseQs = {
    practiceArea: sp.practiceArea,
    userId: sp.userId,
    aggregation,
    range: rangeKey === "custom" ? undefined : rangeKey,
    start: rangeKey === "custom" ? start : undefined,
    end: rangeKey === "custom" ? end : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Firm-wide overview across practice areas, users, and time. Filter the dashboard or jump to a detailed report below."
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Row 1: practice area + user + aggregation */}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                Practice area
              </p>
              <form
                action="/reports"
                method="GET"
                className="flex items-center gap-2"
              >
                {/* Preserve other filters */}
                {sp.userId ? (
                  <input type="hidden" name="userId" value={sp.userId} />
                ) : null}
                <input type="hidden" name="aggregation" value={aggregation} />
                {rangeKey === "custom" ? (
                  <>
                    <input type="hidden" name="start" value={start} />
                    <input type="hidden" name="end" value={end} />
                  </>
                ) : (
                  <input type="hidden" name="range" value={rangeKey} />
                )}
                <select
                  name="practiceArea"
                  defaultValue={sp.practiceArea ?? ""}
                  className="flex-1 rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
                  style={{ borderColor: COLORS.borderDefault }}
                >
                  <option value="">All practice areas</option>
                  {practiceAreas.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md border px-2.5 py-1.5 text-xs"
                  style={{
                    borderColor: COLORS.borderDefault,
                    color: COLORS.text2,
                  }}
                >
                  Apply
                </button>
              </form>
            </div>

            <div>
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                User
              </p>
              <form
                action="/reports"
                method="GET"
                className="flex items-center gap-2"
              >
                {sp.practiceArea ? (
                  <input
                    type="hidden"
                    name="practiceArea"
                    value={sp.practiceArea}
                  />
                ) : null}
                <input type="hidden" name="aggregation" value={aggregation} />
                {rangeKey === "custom" ? (
                  <>
                    <input type="hidden" name="start" value={start} />
                    <input type="hidden" name="end" value={end} />
                  </>
                ) : (
                  <input type="hidden" name="range" value={rangeKey} />
                )}
                <select
                  name="userId"
                  defaultValue={sp.userId ?? ""}
                  className="flex-1 rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
                  style={{ borderColor: COLORS.borderDefault }}
                >
                  <option value="">All users</option>
                  {userOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label} ({u.role.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md border px-2.5 py-1.5 text-xs"
                  style={{
                    borderColor: COLORS.borderDefault,
                    color: COLORS.text2,
                  }}
                >
                  Apply
                </button>
              </form>
            </div>

            <div>
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                Aggregation
              </p>
              <div className="flex gap-1.5">
                {AGG_OPTIONS.map((a) => {
                  const active = a === aggregation;
                  return (
                    <Link
                      key={a}
                      href={`/reports${buildQs(baseQs, { aggregation: a })}`}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-md border text-xs capitalize"
                      style={{
                        borderColor: active
                          ? COLORS.brand
                          : COLORS.borderDefault,
                        color: active ? COLORS.brand : COLORS.text2,
                        background: active
                          ? COLORS.brandSubtle
                          : "transparent",
                      }}
                    >
                      {a}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 2: date range presets + custom picker */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                Range
              </p>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_PRESETS.map((r) => {
                  const active = rangeKey === r.key;
                  return (
                    <Link
                      key={r.key}
                      href={`/reports${buildQs(
                        {
                          practiceArea: sp.practiceArea,
                          userId: sp.userId,
                          aggregation,
                          range: r.key,
                        },
                        { start: undefined, end: undefined },
                      )}`}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-md border text-xs"
                      style={{
                        borderColor: active
                          ? COLORS.brand
                          : COLORS.borderDefault,
                        color: active ? COLORS.brand : COLORS.text2,
                        background: active
                          ? COLORS.brandSubtle
                          : "transparent",
                      }}
                    >
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-[320px]">
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                Custom range
              </p>
              <form
                action="/reports"
                method="GET"
                className="flex flex-wrap items-center gap-2"
              >
                {sp.practiceArea ? (
                  <input
                    type="hidden"
                    name="practiceArea"
                    value={sp.practiceArea}
                  />
                ) : null}
                {sp.userId ? (
                  <input type="hidden" name="userId" value={sp.userId} />
                ) : null}
                <input type="hidden" name="aggregation" value={aggregation} />
                <input
                  type="date"
                  name="start"
                  defaultValue={start}
                  className="rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
                  style={{ borderColor: COLORS.borderDefault }}
                />
                <span className="text-xs" style={{ color: COLORS.text3 }}>
                  to
                </span>
                <input
                  type="date"
                  name="end"
                  defaultValue={end}
                  className="rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
                  style={{ borderColor: COLORS.borderDefault }}
                />
                <button
                  type="submit"
                  className="rounded-md border px-2.5 py-1.5 text-xs"
                  style={{
                    borderColor: COLORS.borderDefault,
                    color: COLORS.text2,
                  }}
                >
                  Apply
                </button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Active cases"
          value={tiles.totalActiveCases}
          sub="All active, snapshot"
        />
        <MetricTile
          label="New cases"
          value={tiles.newCases}
          sub="This period"
        />
        <MetricTile
          label="Closed cases"
          value={tiles.closedCases}
          sub="This period"
        />
        <MetricTile
          label="Avg time in stage"
          value={tiles.avgTimeInStageDays}
          sub="days · this period"
        />
      </div>

      {/* Charts grid — 2x2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cases opened over time */}
        <Card>
          <CardContent className="p-0">
            <div
              className="px-6 py-3 border-b"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: COLORS.text1 }}
              >
                Cases opened vs closed
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                {aggregation === "day"
                  ? "Per day"
                  : aggregation === "week"
                    ? "Per week"
                    : aggregation === "month"
                      ? "Per month"
                      : "Per year"}{" "}
                · {start} → {end}
              </p>
            </div>
            <div className="px-6 py-4">
              {casesOverTime.length === 0 ? (
                <p
                  className="text-sm text-center py-10"
                  style={{ color: COLORS.text3 }}
                >
                  No case activity in this window.
                </p>
              ) : (
                <StackedBar
                  bars={casesOverTime.map((p) => ({
                    label: labelForPeriod(p.period, aggregation),
                    segments: [
                      { key: "opened", value: p.opened },
                      { key: "closed", value: p.closed },
                    ],
                  }))}
                  series={[
                    {
                      key: "opened",
                      label: "Opened",
                      color: COLORS.brand,
                    },
                    {
                      key: "closed",
                      label: "Closed",
                      color: COLORS.ok,
                    },
                  ]}
                  height={180}
                  ariaLabel="Cases opened and closed over time"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Closed outcomes mix */}
        <Card>
          <CardContent className="p-0">
            <div
              className="px-6 py-3 border-b"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: COLORS.text1 }}
              >
                Closed outcomes mix
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                Stacked by outcome · won · lost · withdrawn
              </p>
            </div>
            <div className="px-6 py-4">
              {outcomeMix.length === 0 ? (
                <p
                  className="text-sm text-center py-10"
                  style={{ color: COLORS.text3 }}
                >
                  No closed cases in this window.
                </p>
              ) : (
                <StackedBar
                  bars={outcomeMix.map((p) => ({
                    label: labelForPeriod(p.period, aggregation),
                    segments: [
                      { key: "won", value: p.won },
                      { key: "lost", value: p.lost },
                      { key: "withdrawn", value: p.withdrawn },
                    ],
                  }))}
                  series={[
                    { key: "won", label: "Won", color: COLORS.ok },
                    { key: "lost", label: "Lost", color: COLORS.bad },
                    {
                      key: "withdrawn",
                      label: "Withdrawn",
                      color: COLORS.text4,
                    },
                  ]}
                  height={180}
                  ariaLabel="Closed outcomes over time"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stage throughput funnel */}
        <Card>
          <CardContent className="p-0">
            <div
              className="px-6 py-3 border-b"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: COLORS.text1 }}
              >
                Stage throughput
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                Active cases by stage group (current snapshot)
              </p>
            </div>
            <div className="px-6 py-4">
              {stageThroughput.length === 0 ||
              stageThroughput.every((s) => s.count === 0) ? (
                <p
                  className="text-sm text-center py-10"
                  style={{ color: COLORS.text3 }}
                >
                  No active cases to chart.
                </p>
              ) : (
                <FunnelList rows={stageThroughput} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* At-risk share over time */}
        <Card>
          <CardContent className="p-0">
            <div
              className="px-6 py-3 border-b"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: COLORS.text1 }}
              >
                At-risk share over time
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                % of cases scored high or critical risk per{" "}
                {aggregation === "day" ? "day" : aggregation}
              </p>
            </div>
            <div className="px-6 py-4">
              {atRiskShare.length === 0 ||
              atRiskShare.every((p) => p.atRiskPct === 0) ? (
                <p
                  className="text-sm text-center py-10"
                  style={{ color: COLORS.text3 }}
                >
                  No risk scores recorded in this window.
                </p>
              ) : (
                <StackedBar
                  bars={atRiskShare.map((p) => ({
                    label: labelForPeriod(p.period, aggregation),
                    segments: [
                      { key: "risk", value: p.atRiskPct },
                      { key: "safe", value: Math.max(0, 100 - p.atRiskPct) },
                    ],
                  }))}
                  series={[
                    { key: "risk", label: "At risk", color: COLORS.bad },
                    { key: "safe", label: "Healthy", color: COLORS.okSubtle },
                  ]}
                  height={180}
                  ariaLabel="At-risk share over time"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed reports — keep existing nav tiles so deep-links still work */}
      <div className="space-y-3">
        <div>
          <h2
            className="text-sm font-semibold"
            style={{ color: COLORS.text1 }}
          >
            Detailed reports
          </h2>
          <p className="text-xs" style={{ color: COLORS.text3 }}>
            Drill into a specific report for deeper analysis and CSV export.
          </p>
        </div>
        <ReportNavigationTiles />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelForPeriod(period: string, agg: InsightsAggregation): string {
  if (!period) return "";
  if (agg === "year") return period.slice(0, 4);
  if (agg === "month") return period.slice(0, 7);
  if (agg === "week") return period.slice(5); // MM-DD
  return period.slice(5); // MM-DD for day
}

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: COLORS.text3 }}
        >
          {label}
        </p>
        <p
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: COLORS.text1 }}
        >
          {value.toLocaleString()}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs" style={{ color: COLORS.text3 }}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelList({
  rows,
}: {
  rows: Array<{
    stageGroupName: string;
    stageGroupColor: string | null;
    count: number;
  }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = Math.round((r.count / max) * 100);
        const color = r.stageGroupColor ?? COLORS.brand;
        return (
          <div key={r.stageGroupName} className="flex items-center gap-3">
            <span
              className="text-xs flex-none w-32 truncate"
              style={{ color: COLORS.text2 }}
            >
              {r.stageGroupName}
            </span>
            <div
              className="relative flex-1 h-6 rounded overflow-hidden"
              style={{ background: COLORS.borderSubtle }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 rounded"
                style={{
                  width: `${pct}%`,
                  background: color,
                  opacity: 0.85,
                }}
              />
            </div>
            <span
              className="text-xs tabular-nums flex-none w-10 text-right"
              style={{ color: COLORS.text1 }}
            >
              {r.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
