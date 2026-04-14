"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { COLORS } from "@/lib/design-tokens";

export function SubnavShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ttn-panel-content active">
      <div className="ttn-panel-header">{title}</div>
      {children}
    </div>
  );
}

export function SubnavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="ttn-section-label">{children}</div>;
}

export type ActionItem = {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  /** Server-action wrapper. When set, button runs it via useTransition + toast. */
  onAction?: () => Promise<{ success: boolean; message?: string }>;
  /**
   * Pure-client click handler. Use when the button only needs to open a
   * dialog / set local state (no server mutation). Ignored if `onAction`
   * or `href` is set.
   */
  onClick?: () => void;
  /** Toast text on success (overrides the action's returned message) */
  successText?: string;
  /** When true, render with accent treatment (use sparingly) */
  primary?: boolean;
  /** When true, render disabled with the hint as tooltip — for aspirational items */
  disabled?: boolean;
  /** Tooltip text — shown on hover, useful for "Coming soon" */
  hint?: string;
};

export function SubnavActionGrid({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="ttn-quick-actions">
      {actions.map((a, i) => (
        <SubnavActionGridItem key={i} action={a} />
      ))}
    </div>
  );
}

function SubnavActionGridItem({ action }: { action: ActionItem }) {
  const baseClass = "ttn-quick-action-btn";
  const baseStyle: React.CSSProperties = {
    ...(action.primary
      ? { borderColor: COLORS.brand, color: COLORS.brand }
      : {}),
    ...(action.disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
  };

  if (action.disabled) {
    return (
      <button
        type="button"
        className={baseClass}
        style={baseStyle}
        disabled
        title={action.hint ?? "Coming soon"}
      >
        {action.icon ?? <DefaultActionIcon />}
        <span>{action.label}</span>
      </button>
    );
  }

  if (action.onAction) {
    return (
      <ActionGridButton
        action={action}
        baseClass={baseClass}
        baseStyle={baseStyle}
      />
    );
  }

  if (action.onClick) {
    return (
      <button
        type="button"
        className={baseClass}
        style={baseStyle}
        onClick={action.onClick}
      >
        {action.icon ?? <DefaultActionIcon />}
        <span>{action.label}</span>
      </button>
    );
  }

  if (action.href) {
    return (
      <Link href={action.href} className={baseClass} style={baseStyle}>
        {action.icon ?? <DefaultActionIcon />}
        <span>{action.label}</span>
      </Link>
    );
  }

  return (
    <button type="button" className={baseClass} style={baseStyle} disabled>
      {action.icon ?? <DefaultActionIcon />}
      <span>{action.label}</span>
    </button>
  );
}

function ActionGridButton({
  action,
  baseClass,
  baseStyle,
}: {
  action: ActionItem;
  baseClass: string;
  baseStyle: React.CSSProperties;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className={baseClass}
      style={{ ...baseStyle, opacity: pending ? 0.6 : baseStyle.opacity }}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await action.onAction!();
            if (result.success) {
              toast.success(action.successText ?? result.message ?? "Done");
              router.refresh();
            } else {
              toast.error(result.message ?? "Action failed");
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Action failed");
          }
        });
      }}
    >
      {action.icon ?? <DefaultActionIcon />}
      <span>{pending ? "…" : action.label}</span>
    </button>
  );
}

function DefaultActionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="14"
      height="14"
    >
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

export type StatRowProps = {
  label: string;
  value: string | number;
  href?: string;
  /** Tone for the value (default = text1; bad/warn change colour) */
  tone?: "default" | "warn" | "bad" | "ok";
};

export function SubnavStatRow({ label, value, href, tone = "default" }: StatRowProps) {
  const color =
    tone === "bad"
      ? COLORS.bad
      : tone === "warn"
        ? COLORS.warn
        : tone === "ok"
          ? COLORS.emerald
          : COLORS.text1;
  const inner = (
    <>
      <span>{label}</span>
      <span className="num" style={{ color }}>
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="ttn-today-number">
        {inner}
      </Link>
    );
  }
  return <div className="ttn-today-number">{inner}</div>;
}

export type RecentItem = {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  /** Dot color — maps to existing ttn-activity-dot palette */
  tone?: "green" | "blue" | "amber" | "red" | "purple";
};

export function SubnavRecentList({ items }: { items: RecentItem[] }) {
  if (items.length === 0) {
    return (
      <div
        className="ttn-activity"
        style={{ color: COLORS.text3, fontSize: 12, paddingLeft: 4 }}
      >
        No recent activity yet.
      </div>
    );
  }
  return (
    <div className="ttn-activity">
      {items.map((item) => {
        const inner = (
          <>
            <span className={`ttn-activity-dot ${item.tone ?? "blue"}`} />
            <div className="ttn-activity-body">
              <div className="ttn-activity-title">{item.title}</div>
              {item.meta && <div className="ttn-activity-meta">{item.meta}</div>}
            </div>
          </>
        );
        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className="ttn-activity-item">
              {inner}
            </Link>
          );
        }
        return (
          <div key={item.id} className="ttn-activity-item">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Anchor widget container — used for persona-specific "load-bearing"
 * widgets (AI Next-Action Queue, Prep Strip, Anomaly Inbox, etc.) that
 * need a distinct visual block from the standard stat rows.
 */
export function SubnavAnchorBlock({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 8,
        background: COLORS.brandSubtle,
        border: `1px solid ${COLORS.brandMuted}`,
        marginBottom: 12,
        marginLeft: 6,
        marginRight: 6,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: COLORS.brand,
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
