"use client";

import { useCountUp } from "@/hooks/use-count-up";
import { COLORS } from "@/lib/design-tokens";

type Delta = {
  value: number;
  /** "higher" = positive value is good (default). "lower" = lower is good (response time, errors) */
  goodDirection?: "higher" | "lower";
  unit?: "%" | "pp" | "abs";
};

type Stat = {
  /** Optional uppercase eyebrow above the value */
  label?: string;
  /** The big number — pass as a number for count-up animation, or string for fixed display */
  value: number | string;
  /** Optional subtitle below the value */
  subtitle?: string;
  /** Optional delta chip rendered next to the value */
  delta?: Delta;
  /** Override accent color */
  accent?: string;
  /** Format function for numeric values */
  format?: (n: number) => string;
};

type Props = {
  /** Optional eyebrow text above the whole hero */
  eyebrow?: string;
  /** Single stat OR array of stats (max 4 recommended) */
  stats: Stat | Stat[];
  /** Right-side actions (badges, buttons) */
  actions?: React.ReactNode;
  /** Optional banner banner / badge below the stats */
  footer?: React.ReactNode;
  /** Background — defaults to surface */
  background?: string;
  /** Surface text color — defaults to text1 */
  textColor?: string;
  className?: string;
};

function deltaChip(d: Delta) {
  const isPositive = d.value >= 0;
  const goodDir = d.goodDirection ?? "higher";
  const isGood =
    (isPositive && goodDir === "higher") || (!isPositive && goodDir === "lower");
  const color = isGood ? COLORS.emerald : COLORS.bad;
  const arrow = isPositive ? "▲" : "▼";
  const unit = d.unit ?? "%";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
      style={{
        color,
        backgroundColor: `${color}14`, // ~8% opacity
      }}
    >
      <span>{arrow}</span>
      <span>
        {isPositive ? "+" : ""}
        {Math.abs(d.value).toFixed(unit === "pp" ? 1 : 0)}
        {unit === "pp" ? "pp" : unit === "%" ? "%" : ""}
      </span>
    </span>
  );
}

function StatBlock({ stat, large }: { stat: Stat; large: boolean }) {
  const numeric = typeof stat.value === "number";
  const counted = useCountUp(numeric ? (stat.value as number) : 0, 600);
  const display = numeric
    ? stat.format
      ? stat.format(counted)
      : `${counted.toLocaleString("en-US")}`
    : (stat.value as string);

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {stat.label && (
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.10em]"
          style={{ color: COLORS.text2 }}
        >
          {stat.label}
        </div>
      )}
      <div className="flex items-baseline gap-2 flex-wrap">
        <div
          className="font-semibold leading-none tabular-nums"
          style={{
            fontSize: large ? 84 : 36,
            letterSpacing: "-0.04em",
            color: stat.accent ?? "inherit",
          }}
        >
          {display}
        </div>
        {stat.delta && deltaChip(stat.delta)}
      </div>
      {stat.subtitle && (
        <div
          className="text-[12px] mt-1 max-w-md"
          style={{ color: COLORS.text2 }}
        >
          {stat.subtitle}
        </div>
      )}
    </div>
  );
}

/**
 * Flexible hero card. Supports:
 *  - Single oversized stat (e.g. attorney readiness monolith).
 *  - Multi-stat row 2-4 columns (e.g. case_manager 4-stat hero).
 * The first stat in an array is rendered larger than the rest.
 */
export function StatHero({
  eyebrow,
  stats,
  actions,
  footer,
  background = COLORS.surface,
  textColor = COLORS.text1,
  className,
}: Props) {
  const list = Array.isArray(stats) ? stats : [stats];
  const primary = list[0];
  const rest = list.slice(1);

  return (
    <div
      className={`rounded-[12px] border p-8 dash-fade-up ${className ?? ""}`}
      style={{
        background,
        color: textColor,
        borderColor: COLORS.borderDefault,
      }}
    >
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              {eyebrow}
            </div>
          )}
          <StatBlock stat={primary} large={list.length === 1 || list.length === 2} />
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {rest.length > 0 && (
        <div
          className="mt-6 grid gap-6 pt-6 border-t"
          style={{
            gridTemplateColumns: `repeat(${rest.length}, minmax(0, 1fr))`,
            borderColor: COLORS.borderSubtle,
          }}
        >
          {rest.map((s, i) => (
            <StatBlock key={i} stat={s} large={false} />
          ))}
        </div>
      )}

      {footer && (
        <div
          className="mt-6 pt-4 border-t"
          style={{ borderColor: COLORS.borderSubtle }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
