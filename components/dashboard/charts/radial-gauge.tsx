"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/design-tokens";

type Props = {
  /** 0–100 */
  value: number;
  /** Diameter in px */
  size?: number;
  /** Stroke thickness */
  strokeWidth?: number;
  /** Solid stroke color (overrides gradient if provided) */
  color?: string;
  /** Gradient stops along the arc — defaults to red→amber→blue→green */
  gradient?: string[];
  /** Track (unfilled) color */
  trackColor?: string;
  /** Center label above the value */
  label?: string;
  /** Center subtitle below the value */
  subtitle?: string;
  /** If true, show a breathing halo whose cadence speeds up at low values */
  breathe?: boolean;
  /** Format function for the center number (defaults to `${value}`) */
  formatValue?: (v: number) => string;
  /** Suppress count-up animation (renders final value immediately) */
  noCountUp?: boolean;
  /** Optional className for the outer wrapper */
  className?: string;
};

const DEFAULT_GRADIENT = [
  COLORS.bad,
  COLORS.warn,
  COLORS.ok,
  COLORS.emerald,
];

export function RadialGauge({
  value,
  size = 220,
  strokeWidth = 18,
  color,
  gradient = DEFAULT_GRADIENT,
  trackColor = "rgba(38,60,148,0.06)",
  label,
  subtitle,
  breathe = false,
  formatValue,
  noCountUp = false,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  // Count-up animation for the center number
  const [displayValue, setDisplayValue] = useState(noCountUp ? clamped : 0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (noCountUp || startedRef.current) {
      setDisplayValue(clamped);
      return;
    }
    startedRef.current = true;
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(eased * clamped);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamped, noCountUp]);

  // Breathing cadence: faster when value drops
  const breatheCadence =
    clamped >= 95 ? "3s" : clamped >= 85 ? "2.4s" : "1.8s";

  const gradientId = `dash-gauge-grad-${size}-${gradient.length}`;
  const useGradient = !color && gradient.length > 1;
  const strokeFill = useGradient ? `url(#${gradientId})` : (color ?? gradient[gradient.length - 1]);

  const formatted =
    formatValue?.(displayValue) ?? `${Math.round(displayValue)}`;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {breathe && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full dash-breathe"
          style={{
            // @ts-expect-error — CSS custom property
            "--dash-breathe-cadence": breatheCadence,
            backgroundColor: useGradient
              ? gradient[gradient.length - 1]
              : (color ?? gradient[gradient.length - 1]),
            opacity: 0.2,
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        role="img"
        aria-label={`${label ?? "Gauge"}: ${Math.round(clamped)}%`}
      >
        {useGradient && (
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              {gradient.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / (gradient.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </linearGradient>
          </defs>
        )}
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeFill}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      {/* Center content */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        style={{ pointerEvents: "none" }}
      >
        {label && (
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{ color: COLORS.text2 }}
          >
            {label}
          </div>
        )}
        <div
          className="font-semibold leading-none tabular-nums"
          style={{
            fontSize: Math.round(size * 0.34),
            letterSpacing: "-0.04em",
            color: COLORS.text1,
          }}
        >
          {formatted}
        </div>
        {subtitle && (
          <div
            className="mt-1 text-[12px] max-w-[80%]"
            style={{ color: COLORS.text2 }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
