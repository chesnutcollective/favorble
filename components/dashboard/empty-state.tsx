import { COLORS } from "@/lib/design-tokens";

type Props = {
  /** Optional emoji or icon character (kept simple — no SVG required) */
  icon?: string;
  /** Headline — short, declarative */
  title: string;
  /** One-sentence body explaining when content will appear */
  body?: string;
  /** Optional CTA action */
  action?: { label: string; href: string };
  /** Persona accent color (defaults to brand) */
  accent?: string;
  /** Compact variant for sub-nav spaces */
  compact?: boolean;
  className?: string;
};

/**
 * Shared empty-state for dashboard surfaces. Honest by design — never
 * pretends data exists. Rendered when a query returns zero rows or when
 * the underlying schema doesn't yet capture the metric.
 */
export function DashboardEmptyState({
  icon,
  title,
  body,
  action,
  accent = COLORS.brand,
  compact = false,
  className,
}: Props) {
  return (
    <div
      className={`flex flex-col items-center text-center ${className ?? ""}`}
      style={{
        padding: compact ? "16px 12px" : "24px 16px",
        gap: compact ? 6 : 10,
      }}
    >
      {icon && (
        <div
          aria-hidden
          style={{
            fontSize: compact ? 22 : 32,
            opacity: 0.6,
            lineHeight: 1,
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize: compact ? 12 : 13,
          fontWeight: 500,
          color: COLORS.text1,
          maxWidth: compact ? 220 : 360,
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: compact ? 11 : 12,
            color: COLORS.text3,
            maxWidth: compact ? 240 : 380,
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
      )}
      {action && (
        <a
          href={action.href}
          style={{
            marginTop: 4,
            fontSize: compact ? 11 : 12,
            color: accent,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          {action.label} →
        </a>
      )}
    </div>
  );
}
