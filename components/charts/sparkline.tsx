import { COLORS } from "@/lib/design-tokens";

/**
 * Minimal inline SVG sparkline.
 *
 * Renders a single-line trend at 80x24 (by default) from a numeric series.
 * Used on SM-5 dashboard metric cards where rendering a full chart library
 * would be overkill. Zero client runtime — this is a pure server component.
 *
 * Props:
 * - data: array of numeric samples (oldest → newest)
 * - width/height: optional override of the SVG viewport
 * - stroke: line color; defaults to brand
 * - trendColor: if set, overrides `stroke` based on direction
 *
 * If `data` is empty or has a single point, renders a dashed em-dash-style
 * placeholder so the card still has something visual.
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  stroke,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  const color = stroke ?? COLORS.brand;

  if (!data || data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="block"
      >
        <line
          x1={4}
          x2={width - 4}
          y1={height / 2}
          y2={height / 2}
          stroke={COLORS.text4}
          strokeWidth={1.2}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  if (data.length === 1) {
    const cx = width / 2;
    const cy = height / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="block"
      >
        <circle cx={cx} cy={cy} r={1.8} fill={color} />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padX = 2;
  const padY = 2;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const points = data.map((value, i) => {
    const x = padX + (i / (data.length - 1)) * usableW;
    // invert y so higher values sit toward the top
    const y = padY + (1 - (value - min) / range) * usableH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const path = `M ${points.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="block"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
