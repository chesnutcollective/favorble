"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { COLORS, ANIMATION } from "@/lib/design-tokens";

export type StageItem = {
  id: string;
  /** Title (e.g. claimant name) */
  title: string;
  /** Secondary text (e.g. case number) */
  subtitle?: string;
  /** Right-side badge (e.g. AI confidence score) */
  badge?: { label: string; tone?: "ok" | "warn" | "bad" | "info" };
  /** Relative timestamp (e.g. "2m ago") */
  timestamp?: string;
};

export type Stage = {
  id: string;
  /** Stage name (e.g. "Received") */
  label: string;
  /** Big count for this stage */
  count: number;
  /** Optional throughput sparkline (last N buckets) */
  sparkline?: number[];
  /** Latest items flowing through this stage */
  items?: StageItem[];
  /** Optional anomaly count — renders an amber chip if > 0 */
  anomalies?: number;
  /** Stage's accent (defaults to brand) */
  accent?: string;
};

type Props = {
  stages: Stage[];
  /** When true, renders animated pellets travelling between cards */
  animatePellets?: boolean;
  /** Card height in px */
  height?: number;
  /** Click handler when any stage's "view all" link is clicked */
  onViewAll?: (stageId: string) => void;
  className?: string;
};

const TONE_COLORS = {
  ok: COLORS.emerald,
  warn: COLORS.warn,
  bad: COLORS.bad,
  info: COLORS.ok,
};

/**
 * Horizontal row of N stage cards (3-5) connected by optional traveling
 * pellet animations. Used by post_hearing (Received → Notified → Advanced
 * → Completed). Each card shows a count, sparkline, and the latest items
 * flowing through.
 */
export function StageFlowCards({
  stages,
  animatePellets = false,
  height = 360,
  onViewAll,
  className,
}: Props) {
  return (
    <div
      className={`flex items-stretch gap-3 ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      {stages.map((stage, idx) => (
        <div key={stage.id} className="flex items-stretch flex-1 min-w-0">
          <StageCard stage={stage} onViewAll={onViewAll} />
          {idx < stages.length - 1 && (
            <FlowConnector
              from={stage.accent ?? COLORS.brand}
              to={stages[idx + 1].accent ?? COLORS.brand}
              animate={animatePellets}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StageCard({
  stage,
  onViewAll,
}: {
  stage: Stage;
  onViewAll?: (id: string) => void;
}) {
  const accent = stage.accent ?? COLORS.brand;
  return (
    <div
      className="flex-1 min-w-0 rounded-[10px] border bg-white relative overflow-hidden"
      style={{ borderColor: COLORS.borderDefault }}
    >
      {/* Top accent bar */}
      <div
        className="h-[3px] w-full"
        style={{
          background: stage.anomalies && stage.anomalies > 0 ? COLORS.warn : accent,
        }}
      />
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{ color: COLORS.text2 }}
          >
            {stage.label}
          </div>
          {stage.anomalies && stage.anomalies > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                color: COLORS.warn,
                backgroundColor: COLORS.warnSubtle,
              }}
            >
              {stage.anomalies} anomalies
            </span>
          ) : null}
        </div>

        <div
          className="mt-2 font-semibold leading-none tabular-nums"
          style={{ fontSize: 40, letterSpacing: "-0.04em", color: COLORS.text1 }}
        >
          {stage.count.toLocaleString("en-US")}
        </div>

        {stage.sparkline && stage.sparkline.length > 0 && (
          <div className="mt-2" style={{ color: accent }}>
            <Sparkline data={stage.sparkline} stroke={accent} width={120} height={28} />
          </div>
        )}

        {stage.items && stage.items.length > 0 && (
          <ul className="mt-3 flex-1 space-y-2 overflow-hidden">
            {stage.items.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-[12px]">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase"
                  style={{
                    background: COLORS.brandSubtle,
                    color: COLORS.brand,
                  }}
                >
                  {item.title.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" style={{ color: COLORS.text1 }}>
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div className="truncate text-[11px]" style={{ color: COLORS.text3 }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>
                {item.badge && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                    style={{
                      color: TONE_COLORS[item.badge.tone ?? "info"],
                      background: `${TONE_COLORS[item.badge.tone ?? "info"]}14`,
                    }}
                  >
                    {item.badge.label}
                  </span>
                )}
                {item.timestamp && (
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: COLORS.text3 }}>
                    {item.timestamp}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {onViewAll && (
          <button
            type="button"
            onClick={() => onViewAll(stage.id)}
            className="mt-3 self-start text-[11px] font-medium hover:underline"
            style={{ color: accent }}
          >
            View all in {stage.label} →
          </button>
        )}
      </div>
    </div>
  );
}

function FlowConnector({
  from,
  to,
  animate,
}: {
  from: string;
  to: string;
  animate: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(24);
  useEffect(() => {
    if (!wrapperRef.current) return;
    setWidth(wrapperRef.current.clientWidth);
  }, []);
  return (
    <div
      ref={wrapperRef}
      className="relative w-6 shrink-0"
      style={{ minWidth: 24 }}
    >
      <div
        className="absolute top-1/2 left-0 right-0 h-[1px]"
        style={{
          background: `linear-gradient(to right, ${from}, ${to})`,
          transform: "translateY(-0.5px)",
        }}
      />
      {animate && (
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 w-1.5 rounded-full dash-pellet"
          style={{
            background: `linear-gradient(to right, ${from}, ${to})`,
            // @ts-expect-error CSS custom property
            "--dash-pellet-duration": `${ANIMATION.pelletTravel * 2}ms`,
            "--pellet-distance": `${width}px`,
          }}
        />
      )}
    </div>
  );
}
