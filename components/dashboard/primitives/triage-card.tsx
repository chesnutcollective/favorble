"use client";

import Link from "next/link";
import { COLORS } from "@/lib/design-tokens";
import { ProgressRing } from "@/components/dashboard/charts/progress-ring";

type Action = {
  label: string;
  /** Either an href OR an onClick (use href for navigation, onClick for in-place actions) */
  href?: string;
  onClick?: () => void;
  /** "primary" = filled brand, "ghost" = bordered, "danger" = bordered red */
  variant?: "primary" | "ghost" | "danger";
};

type Props = {
  /** Optional avatar text (initials) */
  avatar?: string;
  /** Optional avatar background color */
  avatarColor?: string;
  /** Card title (e.g. claimant name) */
  title: string;
  /** Card subtitle */
  subtitle?: string;
  /** Right-side meta line — e.g. case number / case stage */
  meta?: string;
  /** Tags / chips rendered above the title (e.g. "BORDERLINE", "DUPLICATE") */
  tags?: Array<{ label: string; tone?: "ok" | "warn" | "bad" | "info" | "neutral" }>;
  /** Optional countdown ring (right side) — useful for deadlines */
  countdownPercent?: number;
  /** Countdown center label (e.g. "3d") */
  countdownLabel?: string;
  /** Body content (e.g. AI-suggested next action) */
  body?: React.ReactNode;
  /** Action buttons row */
  actions?: Action[];
  /** Override accent color */
  accent?: string;
  /** Optional href that wraps the whole card */
  href?: string;
  className?: string;
};

const TONE_COLORS = {
  ok: COLORS.emerald,
  warn: COLORS.warn,
  bad: COLORS.bad,
  info: COLORS.ok,
  neutral: COLORS.text3,
};

/**
 * A decision-pile card. Used heavily by intake (5 archetypes), case_manager
 * (7-cases needing action), attorney (docket), MR (provider trading cards).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ [tags row]                                   │
 *   │ [avatar] title          subtitle    [ring]  │
 *   │          meta                                │
 *   │ [body / AI suggestion]                       │
 *   │ [actions row]                                │
 *   └─────────────────────────────────────────────┘
 */
export function TriageCard({
  avatar,
  avatarColor,
  title,
  subtitle,
  meta,
  tags,
  countdownPercent,
  countdownLabel,
  body,
  actions,
  accent = COLORS.brand,
  href,
  className,
}: Props) {
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`block rounded-[10px] border bg-white p-4 transition-colors hover:border-[#CCC] ${className ?? ""}`}
      style={{ borderColor: COLORS.borderDefault }}
    >
      {tags && tags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {tags.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
              style={{
                color: TONE_COLORS[t.tone ?? "neutral"],
                background: `${TONE_COLORS[t.tone ?? "neutral"]}18`,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3">
        {avatar && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold uppercase"
            style={{
              background: avatarColor ?? `${accent}1c`,
              color: avatarColor ? "#fff" : accent,
            }}
          >
            {avatar.slice(0, 2)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div
              className="truncate text-[14px] font-semibold leading-tight"
              style={{ color: COLORS.text1 }}
            >
              {title}
            </div>
            {meta && (
              <div className="text-[11px] font-mono shrink-0" style={{ color: COLORS.text3 }}>
                {meta}
              </div>
            )}
          </div>
          {subtitle && (
            <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
              {subtitle}
            </div>
          )}
          {body && <div className="mt-2">{body}</div>}
        </div>

        {countdownPercent !== undefined && (
          <div className="shrink-0">
            <ProgressRing
              value={countdownPercent}
              size={48}
              strokeWidth={4}
              color={
                countdownPercent < 30
                  ? COLORS.bad
                  : countdownPercent < 60
                    ? COLORS.warn
                    : accent
              }
              centerLabel={countdownLabel}
            />
          </div>
        )}
      </div>

      {actions && actions.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {actions.map((a, i) => {
            const isPrimary = (a.variant ?? "ghost") === "primary";
            const isDanger = a.variant === "danger";
            const styleProps: React.CSSProperties = isPrimary
              ? { background: accent, color: "#fff", border: `1px solid ${accent}` }
              : isDanger
                ? { color: COLORS.bad, border: `1px solid ${COLORS.bad}33` }
                : { color: COLORS.text2, border: `1px solid ${COLORS.borderDefault}` };
            const ButtonWrapper: React.ElementType = a.href ? Link : "button";
            const props = a.href
              ? { href: a.href }
              : ({ type: "button" as const, onClick: a.onClick });
            return (
              <ButtonWrapper
                key={i}
                {...props}
                className="rounded-[6px] px-2.5 py-1 text-[11px] font-medium hover:opacity-90"
                style={styleProps}
              >
                {a.label}
              </ButtonWrapper>
            );
          })}
        </div>
      )}
    </Wrapper>
  );
}
