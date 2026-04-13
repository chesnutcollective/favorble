"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { COLORS } from "@/lib/design-tokens";

type ActionResult = {
  success: boolean;
  message?: string;
};

type Props = {
  /** Button label */
  label: string;
  /** Optional icon (left of label) */
  icon?: React.ReactNode;
  /** Persona accent for the primary variant */
  accent?: string;
  /** When set, click navigates here (pure-nav button) */
  href?: string;
  /**
   * When set, click invokes this server action wrapper (must return
   * `{success, message?}`). On success: toast + router.refresh().
   */
  onAction?: () => Promise<ActionResult>;
  /** Toast text on success (overrides server message) */
  successText?: string;
  /** When true, render as a primary (accent-bg) button */
  primary?: boolean;
  /** When true, button is disabled — useful for aspirational features */
  disabled?: boolean;
  /** Tooltip / aria-label, e.g. "Coming soon" */
  hint?: string;
};

/**
 * Sub-nav action button. Three modes:
 *   1. href set → renders as Link
 *   2. onAction set → renders as button, runs the action with useTransition,
 *      shows a toast on success/failure and refreshes the route data.
 *   3. disabled = true → renders as disabled button with hint tooltip
 *      (used for aspirational actions whose server logic doesn't exist yet).
 */
export function SubnavActionButton({
  label,
  icon,
  accent = COLORS.brand,
  href,
  onAction,
  successText,
  primary = false,
  disabled = false,
  hint,
}: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    border: `1px solid ${primary ? accent : COLORS.borderDefault}`,
    background: primary ? accent : "#fff",
    color: primary ? "#fff" : COLORS.text1,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : pending ? 0.7 : 1,
    textDecoration: "none",
    textAlign: "left",
    transition: "border-color 150ms ease, background 150ms ease",
  };

  const content = (
    <>
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      <span>{pending ? "…" : label}</span>
    </>
  );

  if (disabled) {
    return (
      <button type="button" style={baseStyle} disabled title={hint ?? "Coming soon"}>
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} style={baseStyle}>
        {content}
      </Link>
    );
  }

  if (onAction) {
    return (
      <button
        type="button"
        style={baseStyle}
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            try {
              const result = await onAction();
              if (result.success) {
                toast.success(successText ?? result.message ?? "Done");
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
        {content}
      </button>
    );
  }

  return (
    <button type="button" style={baseStyle} disabled>
      {content}
    </button>
  );
}
