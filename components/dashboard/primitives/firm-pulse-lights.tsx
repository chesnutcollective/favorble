"use client";

import { COLORS } from "@/lib/design-tokens";

export type PulseLight = {
  id: string;
  label: string;
  /** "ok" = green, "warn" = amber, "bad" = red */
  state: "ok" | "warn" | "bad";
  /** Micro-metric shown next to the label */
  metric?: string;
  /** Hover popover explaining the rule */
  rule?: string;
  /** Optional click target */
  href?: string;
};

const STATE_COLORS = {
  ok: COLORS.emerald,
  warn: COLORS.warn,
  bad: COLORS.bad,
};

type Props = {
  lights: PulseLight[];
  className?: string;
};

/**
 * Horizontal strip of status pills with colored dots. Reviewer's signature
 * "Firm Pulse" element. Amber/red dots gently pulse; green dots are static.
 */
export function FirmPulseLights({ lights, className }: Props) {
  return (
    <div className={`flex items-stretch gap-2 flex-wrap ${className ?? ""}`}>
      {lights.map((l) => {
        const color = STATE_COLORS[l.state];
        const Wrapper: React.ElementType = l.href ? "a" : "div";
        const props = l.href ? { href: l.href } : {};
        return (
          <Wrapper
            key={l.id}
            {...props}
            title={l.rule}
            className="flex-1 min-w-[140px] rounded-[8px] border bg-white px-3 py-2.5 flex items-center gap-2.5 hover:border-[#CCC] transition-colors"
            style={{ borderColor: COLORS.borderDefault, cursor: l.href ? "pointer" : "default" }}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${l.state !== "ok" ? "dash-pulse-dot" : ""}`}
              style={{ background: color, color }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate"
                style={{ color: COLORS.text2 }}
              >
                {l.label}
              </div>
              {l.metric && (
                <div className="text-[12px] tabular-nums truncate" style={{ color: COLORS.text1 }}>
                  {l.metric}
                </div>
              )}
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
