"use client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrendsSectionProps {
  casesByMonth: Array<{ month: string; opened: number; closed: number }>;
  revenueByMonth: Array<{ month: string; amount: number }>;
  taskSparklines: Array<{
    name: string;
    sparklineData: number[];
    currentRate: number;
  }>;
  weeklyVelocity: Array<{
    week: string;
    opened: number;
    closed: number;
    tasksCompleted: number;
    docsProcessed: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format dollar amount as compact label ($0, $20K, $40K, etc.) */
function formatDollar(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

/** Map a value into a Y-pixel range (higher value => lower Y) */
function scaleY(
  value: number,
  minVal: number,
  maxVal: number,
  minY: number,
  maxY: number,
): number {
  if (maxVal === minVal) return (minY + maxY) / 2;
  return maxY - ((value - minVal) / (maxVal - minVal)) * (maxY - minY);
}

/** Build evenly-spaced X positions across a range */
function xPositions(count: number, left: number, right: number): number[] {
  if (count <= 1) return [left];
  const step = (right - left) / (count - 1);
  return Array.from({ length: count }, (_, i) => left + i * step);
}

/** Determine sparkline stroke color based on rate thresholds */
function sparklineColor(rate: number): string {
  if (rate >= 80) return "#00C853";
  if (rate >= 60) return "#F5A623";
  return "#EE0000";
}

/** Determine rate text color class */
function rateColorClass(rate: number): string {
  if (rate >= 80) return "text-[#00C853]";
  if (rate >= 60) return "text-[#F5A623]";
  return "text-[#EE0000]";
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CaseVolumeTrend({
  data,
}: {
  data: TrendsSectionProps["casesByMonth"];
}) {
  // Chart geometry
  const svgW = 600;
  const svgH = 200;
  const padL = 35;
  const padR = 20;
  const padT = 20;
  const padB = 45;
  const chartTop = padT;
  const chartBot = svgH - padB;

  const xs = xPositions(data.length, padL + 20, svgW - padR);

  // Compute Y scale from data
  const allVals = data.flatMap((d) => [d.opened, d.closed]);
  const dataMax = Math.max(...allVals, 1);
  // Round up to a nice ceiling
  const yMax = Math.ceil(dataMax / 5) * 5 || 20;
  const yTicks = [
    0,
    Math.round(yMax / 4),
    Math.round(yMax / 2),
    Math.round((yMax * 3) / 4),
    yMax,
  ];

  const toY = (v: number) => scaleY(v, 0, yMax, chartTop, chartBot);

  const openedPoints = data
    .map((d, i) => `${xs[i]},${toY(d.opened)}`)
    .join(" ");
  const closedPoints = data
    .map((d, i) => `${xs[i]},${toY(d.closed)}`)
    .join(" ");

  // Area fill paths (close polygon at baseline)
  const openedArea = data.map((d, i) => `${xs[i]},${toY(d.opened)}`).join(" L");
  const closedArea = data.map((d, i) => `${xs[i]},${toY(d.closed)}`).join(" L");

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[6px] p-5 transition-colors hover:border-[#CCC]">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em]">
          Case Volume Trend
        </div>
        <div className="text-[11px] text-[#999] font-mono">
          Opened vs Closed / Month
        </div>
      </div>

      <div className="w-full" style={{ height: 200 }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cvgOpened" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0070F3" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#0070F3" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cvgClosed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00C853" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#00C853" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Axes */}
          <line
            x1={padL}
            y1={chartBot}
            x2={svgW - padR}
            y2={chartBot}
            stroke="#EAEAEA"
            strokeWidth={1}
          />
          <line
            x1={padL}
            y1={chartTop}
            x2={padL}
            y2={chartBot}
            stroke="#EAEAEA"
            strokeWidth={1}
          />

          {/* Horizontal grid lines (dashed) */}
          {yTicks.slice(1).map((tick) => (
            <line
              key={`grid-${tick}`}
              x1={padL}
              y1={toY(tick)}
              x2={svgW - padR}
              y2={toY(tick)}
              stroke="#EAEAEA"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks.map((tick) => (
            <text
              key={`ylabel-${tick}`}
              x={padL - 5}
              y={toY(tick) + 3}
              textAnchor="end"
              fill="#999"
              fontFamily="Geist Mono, monospace"
              fontSize={9}
            >
              {tick}
            </text>
          ))}

          {/* X-axis labels */}
          {data.map((d, i) => (
            <text
              key={`xlabel-${i}`}
              x={xs[i]}
              y={svgH - padB + 18}
              textAnchor="middle"
              fill="#999"
              fontFamily="Geist Mono, monospace"
              fontSize={8}
            >
              {d.month}
            </text>
          ))}

          {/* Opened area fill */}
          <path
            d={`M${openedArea} V${chartBot} H${xs[0]} Z`}
            fill="url(#cvgOpened)"
          />
          {/* Opened line */}
          <polyline
            fill="none"
            stroke="#0070F3"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={openedPoints}
          />

          {/* Closed area fill */}
          <path
            d={`M${closedArea} V${chartBot} H${xs[0]} Z`}
            fill="url(#cvgClosed)"
          />
          {/* Closed line */}
          <polyline
            fill="none"
            stroke="#00C853"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={closedPoints}
          />

          {/* Opened dots */}
          {data.map((d, i) => (
            <circle
              key={`odot-${i}`}
              cx={xs[i]}
              cy={toY(d.opened)}
              r={2.5}
              fill="#0070F3"
            />
          ))}
          {/* Closed dots */}
          {data.map((d, i) => (
            <circle
              key={`cdot-${i}`}
              cx={xs[i]}
              cy={toY(d.closed)}
              r={2.5}
              fill="#00C853"
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div className="w-2 h-2 rounded-full bg-[#0070F3]" />
          Opened
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div className="w-2 h-2 rounded-full bg-[#00C853]" />
          Closed
        </div>
      </div>
    </div>
  );
}

function RevenueByMonth({
  data,
}: {
  data: TrendsSectionProps["revenueByMonth"];
}) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  // Round up to a nice ceiling divisible by 3
  const yMax = Math.ceil(maxAmount / 20000) * 20000 || 60000;
  const yTicks = [0, yMax / 3, (yMax * 2) / 3, yMax];

  // For trend line overlay
  const trendPoints = data
    .map((d, i) => {
      const x = ((i + 0.5) / data.length) * 100;
      const y = 100 - (d.amount / yMax) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[6px] p-5 transition-colors hover:border-[#CCC]">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em]">
          Revenue by Month
        </div>
        <div className="text-[11px] text-[#999] font-mono">Fees collected</div>
      </div>

      {/* Y-axis tick labels */}
      <div className="relative" style={{ height: 160, paddingTop: 16 }}>
        <div
          className="absolute left-0 top-0 bottom-[20px] flex flex-col justify-between pointer-events-none"
          style={{ width: 32 }}
        >
          {[...yTicks].reverse().map((tick) => (
            <div
              key={tick}
              className="text-[9px] font-mono text-[#999] text-right pr-1"
            >
              {formatDollar(tick)}
            </div>
          ))}
        </div>
        <div
          className="flex items-end gap-[6px] h-full"
          style={{ marginLeft: 36 }}
        >
          {data.map((d, i) => {
            const pct = (d.amount / yMax) * 100;
            const isLast = i === data.length - 1;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center h-full justify-end"
              >
                <div className="text-[9px] font-mono text-[#666] mb-[2px] whitespace-nowrap">
                  {formatDollar(d.amount)}
                </div>
                <div
                  className={`w-full rounded-t-[4px] transition-[height] duration-400 ease-out ${
                    isLast ? "bg-black" : "bg-[#0070F3]"
                  }`}
                  style={{ height: `${pct}%`, minHeight: 2 }}
                />
                <div className="text-[10px] font-mono text-[#999] mt-1">
                  {d.month}
                </div>
              </div>
            );
          })}

          {/* Trend line overlay */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: "100%", height: "calc(100% - 20px)" }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke="#171717"
              strokeWidth={0.5}
              strokeOpacity={0.4}
              strokeDasharray="2,2"
              points={trendPoints}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function TaskCompletionSparklines({
  data,
}: {
  data: TrendsSectionProps["taskSparklines"];
}) {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[6px] p-5 transition-colors hover:border-[#CCC]">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Task Completion by Team Member
      </div>

      <div>
        {data.map((member, idx) => {
          const color = sparklineColor(member.currentRate);
          const colorClass = rateColorClass(member.currentRate);

          // Build sparkline polyline from sparklineData
          const vals = member.sparklineData;
          const sparkMax = Math.max(...vals, 1);
          const sparkMin = Math.min(...vals, 0);
          const points = vals
            .map((v, i) => {
              const x = vals.length > 1 ? (i / (vals.length - 1)) * 200 : 100;
              const y =
                sparkMax === sparkMin
                  ? 12
                  : 22 - ((v - sparkMin) / (sparkMax - sparkMin)) * 20;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <div
              key={idx}
              className={`flex items-center gap-3 py-2 ${
                idx < data.length - 1 ? "border-b border-[#EAEAEA]" : ""
              }`}
            >
              <div className="w-[100px] text-[12px] text-[#666] shrink-0">
                {member.name}
              </div>
              <div className="flex-1 h-[24px]">
                <svg
                  viewBox="0 0 200 24"
                  preserveAspectRatio="none"
                  className="w-full h-full"
                >
                  <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />
                </svg>
              </div>
              <div
                className={`w-[44px] text-[12px] font-mono font-medium text-right shrink-0 ${colorClass}`}
              >
                {member.currentRate}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyVelocity({
  data,
}: {
  data: TrendsSectionProps["weeklyVelocity"];
}) {
  // Find max value across all metrics for scaling
  const allVals = data.flatMap((w) => [
    w.opened,
    w.closed,
    w.tasksCompleted,
    w.docsProcessed,
  ]);
  const maxVal = Math.max(...allVals, 1);

  const metrics = [
    { key: "opened" as const, label: "Opened", color: "#0070F3" },
    { key: "closed" as const, label: "Closed", color: "#00C853" },
    { key: "tasksCompleted" as const, label: "Tasks", color: "#F5A623" },
    { key: "docsProcessed" as const, label: "Docs", color: "#999999" },
  ];

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[6px] p-5 transition-colors hover:border-[#CCC]">
      <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Weekly Velocity
      </div>

      <div className="flex items-end gap-3" style={{ height: 140 }}>
        {data.map((week, wi) => {
          const isCurrentWeek = wi === data.length - 1;
          return (
            <div key={wi} className="flex-1 flex flex-col items-center h-full">
              {/* Grouped bars */}
              <div className="flex items-end gap-[2px] flex-1 w-full">
                {metrics.map((m) => {
                  const val = week[m.key];
                  const pct = (val / maxVal) * 100;
                  return (
                    <div
                      key={m.key}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                    >
                      <div
                        className="w-full rounded-t-[2px] transition-[height] duration-300 ease-out"
                        style={{
                          height: `${pct}%`,
                          minHeight: 2,
                          backgroundColor: m.color,
                          opacity: isCurrentWeek ? 1 : 0.7,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Week label */}
              <div
                className={`text-[10px] font-mono mt-1.5 ${
                  isCurrentWeek ? "text-[#171717] font-semibold" : "text-[#999]"
                }`}
              >
                {week.week}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 pt-2 border-t border-[#EAEAEA]">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="flex items-center gap-1.5 text-[10px] text-[#666]"
          >
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: m.color }}
            />
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */

export function TrendsSection({
  casesByMonth,
  revenueByMonth,
  taskSparklines,
  weeklyVelocity,
}: TrendsSectionProps) {
  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999] mb-3 pb-2 border-b border-[#EAEAEA]">
        Trends
      </div>

      {/* Row 1: Case Volume + Revenue */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <CaseVolumeTrend data={casesByMonth} />
        <RevenueByMonth data={revenueByMonth} />
      </div>

      {/* Row 2: Task Sparklines + Weekly Velocity */}
      <div className="grid grid-cols-2 gap-4">
        <TaskCompletionSparklines data={taskSparklines} />
        <WeeklyVelocity data={weeklyVelocity} />
      </div>
    </div>
  );
}
