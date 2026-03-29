"use client";

// ---------------------------------------------------------------------------
// Intelligence Section — 6 chart cards (pure CSS / SVG, no charting library)
// Vercel Light design tokens: #EAEAEA borders, 6px radius, 20px card padding
// ---------------------------------------------------------------------------

interface IntelligenceSectionProps {
  aljApprovalRates: Array<{
    aljName: string;
    favorable: number;
    unfavorable: number;
    remand: number;
    total: number;
  }>;
  listingMatchData: Array<{
    listing: string;
    count: number;
    winRate: number;
  }>;
  denialPatterns: Array<{
    reason: string;
    monthlyData: number[];
  }>;
  timeToHearing: Array<{
    hearingOffice: string;
    caseId: string;
    daysToHearing: number;
  }>;
  pastDueProjection: Array<{
    month: string;
    projected: number;
  }>;
  caseComplexity: Array<{
    score: number;
    count: number;
  }>;
}

// ── Shared constants ────────────────────────────────────────────────────────

const NATIONAL_AVG = 46;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const COLORS = {
  green: "#00C853",
  amber: "#F5A623",
  red: "#EE0000",
  blue: "#0070F3",
  border: "#EAEAEA",
  textPrimary: "#171717",
  textSecondary: "#666666",
  textTertiary: "#999999",
} as const;

// ── Card wrapper ────────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-[#EAEAEA] rounded-[6px] p-5 transition-colors duration-200 hover:border-[#CCC] ${className}`}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
      {children}
    </div>
  );
}

function CardTitleRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">{children}</div>
  );
}

function CardMeta({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-[#999] font-mono">{children}</div>;
}

// ── Section label ───────────────────────────────────────────────────────────

function SectionGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999] mb-3 pb-2 border-b border-[#EAEAEA]">
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ALJ APPROVAL RATES — Horizontal stacked bars (full width)
// ═══════════════════════════════════════════════════════════════════════════

function ALJApprovalRates({
  data,
}: {
  data: IntelligenceSectionProps["aljApprovalRates"];
}) {
  return (
    <Card className="mb-4">
      <CardTitleRow>
        <div className="text-[12px] font-medium text-[#999] uppercase tracking-[0.04em]">
          ALJ Approval Rates &mdash; Top 10 Judges
        </div>
        <CardMeta>Favorable / Remand / Unfavorable</CardMeta>
      </CardTitleRow>

      <div>
        {data.map((alj, i) => {
          const favPct =
            alj.total > 0 ? Math.round((alj.favorable / alj.total) * 100) : 0;
          const remPct =
            alj.total > 0 ? Math.round((alj.remand / alj.total) * 100) : 0;
          const unfPct =
            alj.total > 0 ? Math.round((alj.unfavorable / alj.total) * 100) : 0;

          const pctColor =
            favPct >= 55
              ? COLORS.green
              : favPct < 46
                ? COLORS.red
                : COLORS.textPrimary;

          return (
            <div key={alj.aljName} className="flex items-center gap-3 mb-3">
              {/* ALJ name */}
              <div className="w-[140px] min-w-[140px] text-[12px] text-right text-[#171717] whitespace-nowrap overflow-hidden text-ellipsis">
                {alj.aljName}
              </div>

              {/* Stacked bar */}
              <div className="flex-1 h-[22px] flex rounded-[4px] overflow-hidden relative">
                <div
                  className="h-full transition-[width] duration-[600ms] ease-out"
                  style={{
                    width: `${favPct}%`,
                    background: COLORS.green,
                  }}
                />
                <div
                  className="h-full transition-[width] duration-[600ms] ease-out"
                  style={{
                    width: `${remPct}%`,
                    background: COLORS.amber,
                  }}
                />
                <div
                  className="h-full transition-[width] duration-[600ms] ease-out opacity-70"
                  style={{
                    width: `${unfPct}%`,
                    background: COLORS.red,
                  }}
                />

                {/* National average dashed line — only on the first row */}
                {i === 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] z-[2] opacity-60"
                    style={{
                      left: `${NATIONAL_AVG}%`,
                      background: COLORS.textPrimary,
                    }}
                  >
                    <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-[9px] font-mono text-[#999] whitespace-nowrap">
                      Nat. Avg {NATIONAL_AVG}%
                    </span>
                  </div>
                )}
              </div>

              {/* Percentage */}
              <div
                className="w-[44px] min-w-[44px] text-[12px] font-mono font-medium text-right"
                style={{ color: pctColor }}
              >
                {favPct}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 pl-[152px]">
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div
            className="w-[10px] h-[10px] rounded-[2px]"
            style={{ background: COLORS.green }}
          />
          Favorable
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div
            className="w-[10px] h-[10px] rounded-[2px]"
            style={{ background: COLORS.amber }}
          />
          Remand
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div
            className="w-[10px] h-[10px] rounded-[2px] opacity-70"
            style={{ background: COLORS.red }}
          />
          Unfavorable
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
          <div
            className="w-[2px] h-[12px] opacity-60"
            style={{ background: COLORS.textPrimary }}
          />
          National Avg ({NATIONAL_AVG}%)
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LISTING MATCH ANALYSIS — Bubble chart (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function ListingMatchAnalysis({
  data,
}: {
  data: IntelligenceSectionProps["listingMatchData"];
}) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count));
  const minR = 20;
  const maxR = 64;

  // Simple layout: distribute bubbles across a pseudo-grid with some variety
  const positions = [
    { cx: 130, cy: 120 },
    { cx: 285, cy: 100 },
    { cx: 400, cy: 160 },
    { cx: 220, cy: 220 },
    { cx: 370, cy: 250 },
    { cx: 80, cy: 235 },
    { cx: 460, cy: 80 },
    { cx: 60, cy: 110 },
    { cx: 340, cy: 60 },
    { cx: 180, cy: 50 },
  ];

  function bubbleColor(winRate: number): string {
    if (winRate >= 65) return COLORS.green;
    if (winRate >= 50) return COLORS.blue;
    if (winRate >= 35) return COLORS.amber;
    return COLORS.red;
  }

  return (
    <Card>
      <CardTitle>Listing Match Analysis</CardTitle>
      <div className="w-full h-[300px]">
        <svg
          viewBox="0 0 500 300"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        >
          {data.map((item, i) => {
            const pos = positions[i % positions.length];
            const r =
              maxCount > 0
                ? minR + (item.count / maxCount) * (maxR - minR)
                : minR;
            const fill = bubbleColor(item.winRate);

            return (
              <g key={item.listing}>
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={r}
                  fill={fill}
                  opacity={0.85}
                />
                {/* Listing code */}
                <text
                  x={pos.cx}
                  y={pos.cy - (r > 30 ? 6 : 2)}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={r > 30 ? 11 : 9}
                  fontWeight={600}
                >
                  {item.listing}
                </text>
                {/* Case count */}
                {r > 25 && (
                  <text
                    x={pos.cx}
                    y={pos.cy + 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.85)"
                    fontSize={r > 35 ? 10 : 8}
                    fontFamily="'Geist Mono', monospace"
                  >
                    {item.count} cases
                  </text>
                )}
                {/* Win rate */}
                {r > 35 && (
                  <text
                    x={pos.cx}
                    y={pos.cy + 20}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={9}
                    fontFamily="'Geist Mono', monospace"
                  >
                    Win: {item.winRate}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DENIAL PATTERN TRACKER — Heatmap table
// ═══════════════════════════════════════════════════════════════════════════

function DenialPatternTracker({
  data,
}: {
  data: IntelligenceSectionProps["denialPatterns"];
}) {
  // Determine the global max value for color scaling
  const allValues = data.flatMap((d) => d.monthlyData);
  const maxVal = Math.max(...allValues, 1);

  // Last N months of labels (use the length of the first row's data)
  const monthCount = data.length > 0 ? data[0].monthlyData.length : 0;
  const now = new Date();
  const monthHeaders: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthHeaders.push(MONTH_LABELS[d.getMonth()]);
  }

  function cellStyle(value: number): React.CSSProperties {
    const intensity = value / maxVal;
    // White (0) to red (high)
    if (intensity < 0.15) {
      return { background: "#F7F7F7", color: COLORS.textSecondary };
    }
    if (intensity < 0.4) {
      return { background: "#FFEBEE", color: "#c62828" };
    }
    if (intensity < 0.7) {
      return { background: "#FDECEA", color: "#c62828" };
    }
    return { background: "#F9C6C6", color: "#c62828" };
  }

  return (
    <Card>
      <CardTitle>Denial Pattern Tracker</CardTitle>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full border-collapse min-w-[500px]">
          <thead>
            <tr>
              <th className="text-[10px] font-medium uppercase tracking-[0.05em] text-[#999] px-3 py-2 text-left border-b border-[#EAEAEA]">
                Reason
              </th>
              {monthHeaders.map((m) => (
                <th
                  key={m}
                  className="text-[10px] font-medium uppercase tracking-[0.05em] text-[#999] px-3 py-2 text-center border-b border-[#EAEAEA]"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.reason}
                className="border-b border-[#EAEAEA] last:border-b-0"
              >
                <td className="text-left text-[#666] text-[12px] px-3 py-2">
                  {row.reason}
                </td>
                {row.monthlyData.map((val, mi) => (
                  <td key={mi} className="text-center px-3 py-2">
                    <span
                      className="inline-flex items-center justify-center w-[44px] h-[26px] rounded-[4px] text-[10px] font-mono font-medium"
                      style={cellStyle(val)}
                    >
                      {val}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TIME TO HEARING — Scatter plot (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function TimeToHearingScatter({
  data,
}: {
  data: IntelligenceSectionProps["timeToHearing"];
}) {
  // Group by hearing office
  const offices = [...new Set(data.map((d) => d.hearingOffice))];
  const maxDays = 400;

  const svgW = 500;
  const svgH = 280;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  function dotColor(days: number): string {
    if (days < 150) return COLORS.green;
    if (days <= 250) return COLORS.amber;
    return COLORS.red;
  }

  // Distribute offices evenly along X
  const officeXMap: Record<string, number> = {};
  offices.forEach((o, i) => {
    officeXMap[o] = padL + (plotW / (offices.length + 1)) * (i + 1);
  });

  // Y-axis ticks
  const yTicks = [0, 100, 200, 300, 400];

  function yPos(days: number): number {
    return padT + plotH - (days / maxDays) * plotH;
  }

  return (
    <Card>
      <CardTitle>Time to Hearing by Office</CardTitle>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
      >
        {/* Grid lines */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={yPos(t)}
              x2={svgW - padR}
              y2={yPos(t)}
              stroke={COLORS.border}
              strokeWidth={0.5}
              strokeDasharray={t === 0 ? "0" : "4,4"}
            />
            <text
              x={padL - 6}
              y={yPos(t) + 3}
              textAnchor="end"
              fill={COLORS.textTertiary}
              fontSize={9}
              fontFamily="'Geist Mono', monospace"
            >
              {t}d
            </text>
          </g>
        ))}

        {/* Axes */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + plotH}
          stroke={COLORS.border}
          strokeWidth={1}
        />
        <line
          x1={padL}
          y1={padT + plotH}
          x2={svgW - padR}
          y2={padT + plotH}
          stroke={COLORS.border}
          strokeWidth={1}
        />

        {/* Office labels */}
        {offices.map((o) => (
          <text
            key={o}
            x={officeXMap[o]}
            y={svgH - 8}
            textAnchor="middle"
            fill={COLORS.textTertiary}
            fontSize={9}
            fontFamily="'Geist Mono', monospace"
          >
            {o}
          </text>
        ))}

        {/* Axis labels */}
        <text
          x={padL - 30}
          y={padT + plotH / 2}
          textAnchor="middle"
          fill={COLORS.textTertiary}
          fontSize={10}
          fontFamily="'Geist Mono', monospace"
          transform={`rotate(-90, ${padL - 30}, ${padT + plotH / 2})`}
        >
          Days to Hearing
        </text>

        {/* Dots */}
        {data.map((d) => {
          const cx = officeXMap[d.hearingOffice] ?? padL;
          // Add a small random-ish offset per case so dots don't all stack
          const hash =
            d.caseId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
            30;
          const offsetX = hash - 15;
          const cy = yPos(Math.min(d.daysToHearing, maxDays));
          return (
            <circle
              key={d.caseId}
              cx={cx + offsetX}
              cy={cy}
              r={4}
              fill={dotColor(d.daysToHearing)}
              opacity={0.8}
            >
              <title>
                {d.hearingOffice}: {d.daysToHearing} days
              </title>
            </circle>
          );
        })}
      </svg>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. PAST-DUE BENEFITS PROJECTION — Area chart (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function PastDueBenefitsProjection({
  data,
}: {
  data: IntelligenceSectionProps["pastDueProjection"];
}) {
  if (data.length === 0) return null;

  const svgW = 400;
  const svgH = 180;
  const padL = 45;
  const padR = 20;
  const padT = 20;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxVal = Math.max(...data.map((d) => d.projected)) * 1.15;

  // Position each point evenly
  const points = data.map((d, i) => ({
    x: padL + (plotW / (data.length - 1 || 1)) * i,
    y: padT + plotH - (d.projected / maxVal) * plotH,
    month: d.month,
    projected: d.projected,
  }));

  // Solid line = all but last point; dashed = last two points
  const solidPoints = points.slice(0, -1);
  const dashedPoints = points.slice(-2);

  const solidLine = solidPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const dashedLine = dashedPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill path (under the solid line, closing down to baseline)
  const areaPath = [
    `M${solidPoints[0].x},${solidPoints[0].y}`,
    ...solidPoints.slice(1).map((p) => `L${p.x},${p.y}`),
    `L${solidPoints[solidPoints.length - 1].x},${padT + plotH}`,
    `L${solidPoints[0].x},${padT + plotH}`,
    "Z",
  ].join(" ");

  // Y-axis ticks
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round((maxVal / yTickCount) * i),
  );

  function formatDollars(n: number): string {
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${n}`;
  }

  const gradientId = "pdg-intel";

  return (
    <Card>
      <CardTitle>Past-Due Benefits Projection</CardTitle>
      <div className="w-full h-[180px]">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.25} />
              <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Grid */}
          <line
            x1={padL}
            y1={padT + plotH}
            x2={svgW - padR}
            y2={padT + plotH}
            stroke={COLORS.border}
            strokeWidth={1}
          />
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            stroke={COLORS.border}
            strokeWidth={1}
          />
          {yTicks.slice(1).map((t) => {
            const y = padT + plotH - (t / maxVal) * plotH;
            return (
              <line
                key={t}
                x1={padL}
                y1={y}
                x2={svgW - padR}
                y2={y}
                stroke={COLORS.border}
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            );
          })}

          {/* Y labels */}
          {yTicks.map((t) => {
            const y = padT + plotH - (t / maxVal) * plotH;
            return (
              <text
                key={t}
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                fill={COLORS.textTertiary}
                fontSize={9}
                fontFamily="'Geist Mono', monospace"
              >
                {formatDollars(t)}
              </text>
            );
          })}

          {/* X labels */}
          {points.map((p) => (
            <text
              key={p.month}
              x={p.x}
              y={svgH - 4}
              textAnchor="middle"
              fill={COLORS.textTertiary}
              fontSize={9}
              fontFamily="'Geist Mono', monospace"
            >
              {p.month}
            </text>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Solid line */}
          <polyline
            fill="none"
            stroke={COLORS.blue}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={solidLine}
          />

          {/* Dashed projection line */}
          {dashedPoints.length === 2 && (
            <polyline
              fill="none"
              stroke={COLORS.blue}
              strokeWidth={2}
              strokeDasharray="6,4"
              strokeLinecap="round"
              points={dashedLine}
            />
          )}

          {/* End-point dot and label */}
          {solidPoints.length > 0 && (
            <>
              <circle
                cx={solidPoints[solidPoints.length - 1].x}
                cy={solidPoints[solidPoints.length - 1].y}
                r={3}
                fill={COLORS.blue}
              />
              <text
                x={solidPoints[solidPoints.length - 1].x + 8}
                y={solidPoints[solidPoints.length - 1].y - 4}
                fill={COLORS.blue}
                fontSize={9}
                fontFamily="'Geist Mono', monospace"
              >
                {formatDollars(solidPoints[solidPoints.length - 1].projected)}
              </text>
            </>
          )}
        </svg>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CASE COMPLEXITY DISTRIBUTION — Histogram
// ═══════════════════════════════════════════════════════════════════════════

function CaseComplexityHistogram({
  data,
}: {
  data: IntelligenceSectionProps["caseComplexity"];
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  function barColor(score: number): string {
    if (score <= 3) return COLORS.green;
    if (score <= 7) return COLORS.blue;
    return COLORS.amber;
  }

  return (
    <Card>
      <CardTitle>Case Complexity Distribution</CardTitle>
      {/* Histogram bars */}
      <div className="flex items-end gap-2 h-[140px] pt-4">
        {data.map((d) => {
          const heightPct = (d.count / maxCount) * 100;
          return (
            <div
              key={d.score}
              className="flex-1 flex flex-col items-center h-full justify-end"
            >
              <div className="text-[10px] font-mono font-medium text-[#171717] mb-[2px]">
                {d.count}
              </div>
              <div
                className="w-full rounded-t-[4px] transition-[height] duration-[400ms] ease-out"
                style={{
                  height: `${heightPct}%`,
                  background: barColor(d.score),
                  minHeight: 2,
                }}
              />
              <div className="text-[9px] font-mono text-[#999] mt-1 whitespace-nowrap">
                {d.score}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="text-center text-[10px] text-[#999] font-mono mt-2"
        dangerouslySetInnerHTML={{
          __html: "Complexity Score (Low &rarr; High)",
        }}
      />
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function IntelligenceSection({
  aljApprovalRates,
  listingMatchData,
  denialPatterns,
  timeToHearing,
  pastDueProjection,
  caseComplexity,
}: IntelligenceSectionProps) {
  return (
    <div className="mb-8">
      <SectionGroupLabel>Intelligence</SectionGroupLabel>

      {/* 1. ALJ Approval Rates — full width */}
      <ALJApprovalRates data={aljApprovalRates} />

      {/* 2-3. Two-column grid: Listing Match + Denial Patterns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ListingMatchAnalysis data={listingMatchData} />
        <DenialPatternTracker data={denialPatterns} />
      </div>

      {/* 4-6. Three-column grid: Scatter + Area + Histogram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <TimeToHearingScatter data={timeToHearing} />
        <PastDueBenefitsProjection data={pastDueProjection} />
        <CaseComplexityHistogram data={caseComplexity} />
      </div>
    </div>
  );
}
