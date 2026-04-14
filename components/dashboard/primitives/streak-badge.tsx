"use client";

import { COLORS } from "@/lib/design-tokens";

type Props = {
  /** Number of consecutive units */
  count: number;
  /** Unit label (e.g. "days", "hearings") */
  unit: string;
  /** Description of the streak (e.g. "no missed deadlines") */
  description?: string;
  /** Optional flame intensity (0-1) for visual weight */
  intensity?: number;
  /** Render with a "reset" treatment when streak just broke */
  broken?: boolean;
  className?: string;
};

/**
 * A streak indicator pill. Used by admin (green-streak), case_manager
 * (no-missed-deadlines), MR (team color streak), post_hearing (auto-handled).
 */
export function StreakBadge({
  count,
  unit,
  description,
  intensity = 0.5,
  broken = false,
  className,
}: Props) {
  if (broken) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${className ?? ""}`}
        style={{
          borderColor: `${COLORS.bad}33`,
          background: COLORS.badSubtle,
          color: COLORS.bad,
        }}
      >
        <span>↻</span>
        <span className="font-medium">Streak reset</span>
        <span className="text-[11px] opacity-70">— let's rebuild</span>
      </div>
    );
  }

  const flameOpacity = Math.max(0.4, Math.min(1, intensity));
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${className ?? ""}`}
      style={{
        borderColor: `${COLORS.emerald}33`,
        background: `${COLORS.emerald}12`,
      }}
    >
      <span style={{ fontSize: 14, opacity: flameOpacity }} aria-hidden>
        🔥
      </span>
      <span
        className="text-[13px] font-semibold tabular-nums"
        style={{ color: COLORS.emeraldDeep }}
      >
        {count}
      </span>
      <span className="text-[12px]" style={{ color: COLORS.emeraldDeep }}>
        {unit}
      </span>
      {description && (
        <span className="text-[11px]" style={{ color: COLORS.text2 }}>
          · {description}
        </span>
      )}
    </div>
  );
}
