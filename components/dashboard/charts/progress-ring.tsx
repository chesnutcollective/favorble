"use client";

import { COLORS } from "@/lib/design-tokens";

type Props = {
  /** 0-100 */
  value: number;
  /** Diameter in px */
  size?: number;
  /** Stroke thickness */
  strokeWidth?: number;
  /** Solid stroke color */
  color?: string;
  /** Track color */
  trackColor?: string;
  /** Center value text (overrides default `value%`) */
  centerLabel?: string;
  /** Center subtitle */
  centerSubtitle?: string;
  className?: string;
};

/**
 * Simple progress / completion ring. Lighter weight than RadialGauge —
 * single solid color, no breathing, no count-up. Used inline within cards
 * (attorney prep ring 72px, appeals_council deadline ring, pre-hearing
 * race ring).
 */
export function ProgressRing({
  value,
  size = 72,
  strokeWidth = 6,
  color = COLORS.brand,
  trackColor = "rgba(38,60,148,0.10)",
  centerLabel,
  centerSubtitle,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${Math.round(clamped)}%`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 800ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="font-semibold leading-none tabular-nums"
          style={{
            fontSize: Math.round(size * 0.32),
            letterSpacing: "-0.03em",
            color: COLORS.text1,
          }}
        >
          {centerLabel ?? `${Math.round(clamped)}%`}
        </div>
        {centerSubtitle && (
          <div
            className="text-[9px] uppercase tracking-[0.10em] mt-0.5"
            style={{ color: COLORS.text3 }}
          >
            {centerSubtitle}
          </div>
        )}
      </div>
    </div>
  );
}
