"use client";

import { COLORS } from "@/lib/design-tokens";

type Props = {
  /** Where this firm/user sits on the distribution (0-100) */
  value: number;
  /** Optional label above the band */
  label?: string;
  /** Threshold above which the indicator glows gold (e.g. top 15% → 85) */
  goldThreshold?: number;
  /** Comparison label appended to the right (e.g. "national avg ~10%") */
  comparison?: string;
  /** Width of the band */
  width?: number | string;
  className?: string;
};

const QUARTILE_LABELS = ["20", "40", "60", "80"];

/**
 * Horizontal band showing where a value sits on a distribution. Used by:
 *   - reviewer (firm win rate vs national 20/40/60/80 percentiles)
 *   - appeals_council (grant rate vs national average)
 *
 * If `value >= goldThreshold` the indicator glows gold and a "top X%"
 * pill renders to the right.
 */
export function PercentileBand({
  value,
  label,
  goldThreshold = 85,
  comparison,
  width = "100%",
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const isGold = clamped >= goldThreshold;
  const indicatorColor = isGold ? COLORS.gold : COLORS.brand;
  const topPercent = Math.max(1, 100 - clamped);

  return (
    <div className={className} style={{ width }}>
      {label && (
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-1.5"
          style={{ color: COLORS.text3 }}
        >
          {label}
        </div>
      )}
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "#EBEFF6" }}>
        {/* Quartile dividers */}
        {[20, 40, 60, 80].map((p) => (
          <div
            key={p}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${p}%`, background: "rgba(255,255,255,0.7)" }}
          />
        ))}
        {/* Value indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full"
          style={{
            left: `${clamped}%`,
            background: indicatorColor,
            boxShadow: isGold ? "0 0 0 4px rgba(234,179,8,0.25)" : `0 0 0 3px ${indicatorColor}33`,
          }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px]" style={{ color: COLORS.text3 }}>
        <div className="flex justify-between flex-1">
          {QUARTILE_LABELS.map((p) => (
            <span key={p}>{p}%</span>
          ))}
        </div>
      </div>
      {(isGold || comparison) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {isGold && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "rgba(234,179,8,0.12)", color: "#854d0e" }}
            >
              ★ Top {Math.ceil(topPercent)}%
            </span>
          )}
          {comparison && (
            <span className="text-[11px]" style={{ color: COLORS.text3 }}>
              {comparison}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
