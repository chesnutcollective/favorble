import { COLORS } from "@/lib/design-tokens";

/**
 * Inline SVG bar showing actual vs target for a single metric.
 *
 * - Green if actual meets/exceeds target (for higher_is_better) or
 *   is at/below target (for lower_is_better)
 * - Red if actual breaches the critical threshold
 * - Amber otherwise (in warn zone)
 *
 * Pure server component, zero client runtime. Follows the sparkline.tsx
 * pattern from the charts directory.
 */

type Props = {
  actual: number;
  target: number;
  teamAvg?: number;
  critical: number;
  warn: number;
  direction: "higher_is_better" | "lower_is_better";
  unit?: string;
  width?: number;
  height?: number;
};

function pickColor(
  actual: number,
  target: number,
  warn: number,
  critical: number,
  direction: "higher_is_better" | "lower_is_better",
): string {
  if (direction === "higher_is_better") {
    if (actual >= target) return COLORS.ok;
    if (actual <= critical) return COLORS.bad;
    if (actual <= warn) return COLORS.warn;
    return COLORS.warn;
  }
  // lower_is_better
  if (actual <= target) return COLORS.ok;
  if (actual >= critical) return COLORS.bad;
  if (actual >= warn) return COLORS.warn;
  return COLORS.warn;
}

export function ComparisonBar({
  actual,
  target,
  teamAvg,
  critical,
  warn,
  direction,
  width = 160,
  height = 20,
}: Props) {
  const color = pickColor(actual, target, warn, critical, direction);

  // Determine scale max: largest of actual, target, teamAvg, critical
  const candidates = [actual, target, critical];
  if (teamAvg !== undefined) candidates.push(teamAvg);
  const scaleMax = Math.max(...candidates) * 1.15 || 1;

  const padX = 2;
  const barH = 6;
  const barY = (height - barH) / 2;
  const usableW = width - padX * 2;

  const actualW = Math.max(1, (actual / scaleMax) * usableW);
  const targetX = padX + (target / scaleMax) * usableW;
  const teamAvgX =
    teamAvg !== undefined ? padX + (teamAvg / scaleMax) * usableW : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="block"
    >
      {/* Background track */}
      <rect
        x={padX}
        y={barY}
        width={usableW}
        height={barH}
        rx={3}
        fill={COLORS.borderSubtle}
      />
      {/* Actual bar */}
      <rect
        x={padX}
        y={barY}
        width={Math.min(actualW, usableW)}
        height={barH}
        rx={3}
        fill={color}
        opacity={0.85}
      />
      {/* Target marker */}
      <line
        x1={targetX}
        x2={targetX}
        y1={barY - 2}
        y2={barY + barH + 2}
        stroke={COLORS.text1}
        strokeWidth={1.5}
        strokeDasharray="2 1"
      />
      {/* Team avg marker */}
      {teamAvgX !== null && (
        <line
          x1={teamAvgX}
          x2={teamAvgX}
          y1={barY - 2}
          y2={barY + barH + 2}
          stroke={COLORS.brand}
          strokeWidth={1}
          strokeDasharray="1 1"
        />
      )}
    </svg>
  );
}
