"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, ANIMATION } from "@/lib/design-tokens";

export type TickerItem = {
  /** Stable key */
  id: string;
  /** Optional color tag (default brand) */
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  /** Main label text */
  label: string;
  /** Optional secondary text shown after the label */
  detail?: string;
  /** Optional click handler */
  onClick?: () => void;
};

type Props = {
  items: TickerItem[];
  /** Pixels per second scroll speed (defaults to design-token value) */
  pxPerSec?: number;
  /** Strip height in px */
  height?: number;
  /** Background color (defaults to subtle dark) */
  background?: string;
  /** Optional className for outer wrapper */
  className?: string;
};

const TONE_COLORS: Record<NonNullable<TickerItem["tone"]>, string> = {
  ok: COLORS.emerald,
  warn: COLORS.warn,
  bad: COLORS.bad,
  info: COLORS.ok,
  neutral: COLORS.text3,
};

/**
 * A horizontal scrolling text strip — displays a stream of items and loops
 * continuously left-to-right. Pauses on hover. Used by admin (ECG events),
 * mail (movement), fee_collection (payments), post-hearing (outcomes), filing
 * (ERE acceptances).
 *
 * The list is duplicated inline so the marquee can use a -50% transform and
 * loop seamlessly.
 */
export function LiveTicker({
  items,
  pxPerSec = ANIMATION.tickerScrollPxPerSec,
  height = 28,
  background = "rgba(14,22,51,0.92)",
  className,
}: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState("60s");

  useEffect(() => {
    if (!innerRef.current) return;
    // Width of the *single* (un-duplicated) list = half the inner width
    const innerWidth = innerRef.current.scrollWidth / 2;
    if (innerWidth <= 0) return;
    const seconds = Math.max(20, innerWidth / pxPerSec);
    setDuration(`${Math.round(seconds)}s`);
  }, [items, pxPerSec]);

  if (items.length === 0) return null;

  // Duplicate the list so the -50% translate loops seamlessly
  const doubled = [...items, ...items];

  return (
    <div
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{ height, background }}
      role="status"
      aria-label="Live activity ticker"
    >
      <div
        ref={innerRef}
        className="flex items-center whitespace-nowrap dash-ticker"
        style={{
          // @ts-expect-error — CSS custom property
          "--dash-ticker-duration": duration,
          height,
        }}
      >
        {doubled.map((item, i) => {
          const tone = TONE_COLORS[item.tone ?? "neutral"];
          return (
            <button
              key={`${item.id}-${i}`}
              type="button"
              onClick={item.onClick}
              className="inline-flex items-center gap-2 px-3 text-[11px] font-mono"
              style={{
                color: "rgba(255,255,255,0.78)",
                cursor: item.onClick ? "pointer" : "default",
                background: "transparent",
                border: "none",
                height: "100%",
              }}
            >
              <span style={{ color: tone, fontSize: 8 }}>●</span>
              <span style={{ color: "rgba(255,255,255,0.9)" }}>
                {item.label}
              </span>
              {item.detail && (
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  {item.detail}
                </span>
              )}
              <span aria-hidden style={{ color: "rgba(255,255,255,0.25)" }}>
                ·
              </span>
            </button>
          );
        })}
      </div>
      {/* Edge fades */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-12"
        style={{
          background: `linear-gradient(to right, ${background}, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-full w-12"
        style={{
          background: `linear-gradient(to left, ${background}, transparent)`,
        }}
      />
    </div>
  );
}
