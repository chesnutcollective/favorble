import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import {
  getUserPerformance,
  getUserTrend,
  type UserMetricSnapshot,
} from "@/app/actions/leaderboards";
import { getRolePatternAnalysis } from "@/app/actions/team-reports";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "User Performance",
};

function statusColor(status: UserMetricSnapshot["status"]): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "healthy":
      return { bg: COLORS.okSubtle, fg: COLORS.ok };
    case "warn":
      return { bg: COLORS.warnSubtle, fg: COLORS.warn };
    case "critical":
      return { bg: COLORS.badSubtle, fg: COLORS.bad };
  }
}

function formatValue(value: number, unit: UserMetricSnapshot["unit"]): string {
  switch (unit) {
    case "percent":
      return `${value}%`;
    case "currency":
      return `$${value.toLocaleString()}`;
    case "hours":
      return `${value}h`;
    case "days":
      return `${value}d`;
    case "minutes":
      return `${value}m`;
    case "count":
    default:
      return value.toLocaleString();
  }
}

function trendBadge(trend: "improving" | "declining" | "stable") {
  switch (trend) {
    case "improving":
      return { label: "Improving", color: COLORS.ok, icon: "\u2191" };
    case "declining":
      return { label: "Declining", color: COLORS.bad, icon: "\u2193" };
    case "stable":
      return { label: "Stable", color: COLORS.text3, icon: "\u2014" };
  }
}

function Sparkline({
  points,
  color,
  declining,
}: {
  points: { value: number }[];
  color: string;
  declining?: boolean;
}) {
  if (points.length < 2) {
    return <span className="text-xs text-[#999]">no trend data</span>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 120;
  const h = 36;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = values.map((v) =>
    max === min ? h / 2 : h - ((v - min) / (max - min)) * h,
  );
  const path = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="block">
      {declining && (
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={4}
          fill={COLORS.bad}
          opacity={0.06}
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default async function UserPerformancePage({ params }: PageProps) {
  await requireSession();
  const { userId } = await params;

  let perf: Awaited<ReturnType<typeof getUserPerformance>> = null;
  try {
    perf = await getUserPerformance(userId);
  } catch {
    // DB unavailable
  }

  if (!perf) notFound();

  // For each metric, also fetch a 30-day trend
  const trends = await Promise.all(
    perf.metrics.map((m) =>
      getUserTrend(userId, m.metricKey, 30).catch(() => ({
        points: [],
        trend: "stable" as const,
      })),
    ),
  );

  // RP-3: pull a process-vs-people pattern verdict + AI narrative for
  // each metric on this user's role. Failures fall back to null so the
  // metric card still renders without the badge/sentence.
  const patterns = await Promise.all(
    perf.metrics.map((m) =>
      getRolePatternAnalysis(perf.role, m.metricKey).catch(() => null),
    ),
  );

  // RP-4: Trend summary counts
  const improvingCount = trends.filter((t) => t.trend === "improving").length;
  const decliningCount = trends.filter((t) => t.trend === "declining").length;
  const stableCount = trends.filter((t) => t.trend === "stable").length;

  // Find the first declining metric for the summary note
  const firstDecliningIdx = trends.findIndex((t) => t.trend === "declining");
  const firstDecliningMetric =
    firstDecliningIdx >= 0 ? perf.metrics[firstDecliningIdx] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={perf.name}
        description={`${perf.role.replace(/_/g, " ")} · composite ${perf.compositeScore}/100`}
        actions={
          <Link
            href="/reports/team-performance"
            className="inline-flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-[#EAEAEA] text-[#263c94] hover:border-[#263c94] transition-colors"
          >
            Back to team
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Composite Score
            </p>
            <p
              className="text-[32px] font-bold tracking-[-1px] leading-[1.1]"
              style={{
                color:
                  perf.compositeScore >= 80
                    ? COLORS.ok
                    : perf.compositeScore >= 60
                    ? COLORS.warn
                    : COLORS.bad,
              }}
            >
              {perf.compositeScore}
              <span
                className="text-sm font-normal ml-1"
                style={{ color: COLORS.text3 }}
              >
                / 100
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Metrics Tracked
            </p>
            <p className="text-[32px] font-bold tracking-[-1px] leading-[1.1]">
              {perf.metrics.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              At-Risk Metrics
            </p>
            <p
              className="text-[32px] font-bold tracking-[-1px] leading-[1.1]"
              style={{
                color:
                  perf.metrics.filter((m) => m.status !== "healthy").length > 0
                    ? COLORS.bad
                    : COLORS.ok,
              }}
            >
              {perf.metrics.filter((m) => m.status !== "healthy").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RP-4: Trend summary */}
      <Card>
        <CardContent className="p-5">
          <h3
            className="text-sm font-semibold mb-2"
            style={{ color: COLORS.text1 }}
          >
            Trend Summary (30 days)
          </h3>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span style={{ color: COLORS.ok }}>
              <span className="font-semibold">{improvingCount}</span> improving
            </span>
            <span style={{ color: COLORS.text3 }}>
              <span className="font-semibold">{stableCount}</span> stable
            </span>
            <span style={{ color: COLORS.bad }}>
              <span className="font-semibold">{decliningCount}</span> declining
            </span>
          </div>
          {firstDecliningMetric && (
            <p
              className="text-xs mt-2"
              style={{ color: COLORS.text2 }}
            >
              Attention needed: <span className="font-medium">{firstDecliningMetric.label}</span> is showing a declining trend
              {decliningCount > 1
                ? ` (and ${decliningCount - 1} other metric${decliningCount - 1 > 1 ? "s" : ""})`
                : ""}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {perf.metrics.map((metric, i) => {
          const colors = statusColor(metric.status);
          const trendData = trends[i];
          const pattern = patterns[i];
          const tb = trendBadge(trendData.trend);
          return (
            <Card key={metric.metricKey}>
              <CardContent className="p-5">
                {pattern && pattern.classification.kind !== "unclear" && (
                  <div
                    className="mb-3 rounded-md border p-2.5"
                    style={{
                      borderColor: COLORS.borderSubtle,
                      backgroundColor: COLORS.surface,
                    }}
                  >
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: COLORS.text2 }}
                    >
                      {pattern.narrative}
                    </p>
                    <div className="mt-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                        style={{
                          borderColor:
                            pattern.classification.kind === "process"
                              ? COLORS.warn
                              : COLORS.brand,
                          color:
                            pattern.classification.kind === "process"
                              ? COLORS.warn
                              : COLORS.brand,
                        }}
                      >
                        {pattern.classification.kind} problem
                      </Badge>
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: COLORS.text1 }}
                      >
                        {metric.label}
                      </h3>
                      {/* RP-4: Trend badge */}
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{
                          borderColor: tb.color,
                          color: tb.color,
                        }}
                      >
                        {tb.icon} {tb.label}
                      </Badge>
                    </div>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: COLORS.text3 }}
                    >
                      {metric.description}
                    </p>
                  </div>
                  <Badge
                    style={{ background: colors.bg, color: colors.fg }}
                    className="capitalize ml-2"
                  >
                    {metric.status}
                  </Badge>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p
                      className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums"
                      style={{ color: colors.fg }}
                    >
                      {formatValue(metric.currentValue, metric.unit)}
                    </p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: COLORS.text3 }}
                    >
                      target {formatValue(metric.target, metric.unit)} ·
                      warn {formatValue(metric.warn, metric.unit)} ·
                      critical {formatValue(metric.critical, metric.unit)}
                    </p>
                    {metric.deltaPercent !== null && (
                      <p className="text-xs mt-1" style={{ color: COLORS.text2 }}>
                        {metric.delta >= 0 ? "+" : ""}
                        {metric.delta} vs prior ({metric.deltaPercent >= 0 ? "+" : ""}
                        {metric.deltaPercent}%)
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <Sparkline
                      points={trendData.points}
                      color={colors.fg}
                      declining={trendData.trend === "declining"}
                    />
                    <span
                      className="text-xs mt-1"
                      style={{ color: tb.color }}
                    >
                      {tb.icon} {tb.label}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
