import { COLORS } from "@/lib/design-tokens";

/**
 * Reusable inline SVG stacked bar chart.
 *
 * Renders a sequence of bars where each bar is composed of multiple
 * colored segments stacked vertically. Used by QA-3 to chart sentiment
 * distribution per day across the org. Zero client runtime — pure
 * server component, follows the sparkline.tsx pattern (no charting
 * library dependency).
 *
 * Props:
 * - bars: array of bar entries; each has a `label` (axis tick) and a
 *   `segments` array. Segment order is preserved bottom → top.
 * - series: ordered list of segment keys with display name + color,
 *   used to render the legend so segments stay consistent across bars.
 * - width / height / barWidth / gap: layout overrides. Defaults size
 *   the chart for ~30 daily bars in a desktop card.
 * - showLegend: hide if you want to render the legend yourself.
 *
 * Empty bars (sum 0) render a faint baseline tick so the day label
 * still anchors visually.
 */

export type StackedBarSegment = {
  key: string;
  value: number;
};

export type StackedBarEntry = {
  label: string;
  segments: StackedBarSegment[];
};

export type StackedBarSeries = {
  key: string;
  label: string;
  color: string;
};

type Props = {
  bars: StackedBarEntry[];
  series: StackedBarSeries[];
  width?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  showLegend?: boolean;
  ariaLabel?: string;
};

const PAD_X = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 22; // room for the x-axis label

export function StackedBar({
  bars,
  series,
  width,
  height = 180,
  barWidth = 14,
  gap = 4,
  showLegend = true,
  ariaLabel,
}: Props) {
  const seriesByKey = new Map(series.map((s) => [s.key, s]));

  // Compute the per-bar totals and the chart maximum.
  const totals = bars.map((b) =>
    b.segments.reduce((acc, s) => acc + (s.value > 0 ? s.value : 0), 0),
  );
  const maxTotal = Math.max(1, ...totals);

  const computedWidth =
    width ??
    Math.max(PAD_X * 2 + bars.length * (barWidth + gap), PAD_X * 2 + barWidth);

  const usableH = height - PAD_TOP - PAD_BOTTOM;

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <svg
          width={computedWidth}
          height={height}
          viewBox={`0 0 ${computedWidth} ${height}`}
          role="img"
          aria-label={ariaLabel ?? "stacked bar chart"}
          className="block"
        >
          {/* Baseline */}
          <line
            x1={PAD_X}
            x2={computedWidth - PAD_X}
            y1={PAD_TOP + usableH}
            y2={PAD_TOP + usableH}
            stroke={COLORS.borderSubtle}
            strokeWidth={1}
          />

          {bars.map((bar, i) => {
            const x = PAD_X + i * (barWidth + gap);
            const total = totals[i];

            if (total === 0) {
              return (
                <g key={`${bar.label}-${i}`}>
                  <line
                    x1={x}
                    x2={x + barWidth}
                    y1={PAD_TOP + usableH - 0.5}
                    y2={PAD_TOP + usableH - 0.5}
                    stroke={COLORS.text4}
                    strokeWidth={1.2}
                  />
                  {i % 5 === 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={height - 6}
                      fontSize="9"
                      textAnchor="middle"
                      fill={COLORS.text3}
                    >
                      {bar.label}
                    </text>
                  )}
                </g>
              );
            }

            // Render each segment from bottom to top.
            let yCursor = PAD_TOP + usableH;
            const rects: React.ReactNode[] = [];
            for (const seg of bar.segments) {
              const v = seg.value > 0 ? seg.value : 0;
              if (v === 0) continue;
              const segH = (v / maxTotal) * usableH;
              yCursor -= segH;
              const meta = seriesByKey.get(seg.key);
              rects.push(
                <rect
                  key={`${bar.label}-${seg.key}`}
                  x={x}
                  y={yCursor}
                  width={barWidth}
                  height={Math.max(1, segH)}
                  fill={meta?.color ?? COLORS.text4}
                >
                  <title>
                    {`${bar.label} · ${meta?.label ?? seg.key}: ${v}`}
                  </title>
                </rect>,
              );
            }

            return (
              <g key={`${bar.label}-${i}`}>
                {rects}
                {i % 5 === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 6}
                    fontSize="9"
                    textAnchor="middle"
                    fill={COLORS.text3}
                  >
                    {bar.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-3">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[11px]" style={{ color: COLORS.text2 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
