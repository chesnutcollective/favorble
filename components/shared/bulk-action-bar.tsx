"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sticky bulk-action toolbar shown while there's at least one selected row.
 *
 * Placement:
 *   - On >=640px it renders as a sticky bar pinned to the top of the main
 *     content area (directly above the list/table).
 *   - On <640px it drops to the bottom of the viewport as a fixed bar, so
 *     it behaves like a FAB/action tray for touch users.
 *
 * A11y: the bar is `role="toolbar" aria-label="Bulk actions"` and includes
 * a live region for the selection count so screen readers announce changes.
 */
export interface BulkActionBarProps {
  /** Number of currently-selected rows. */
  count: number;
  /**
   * Short label for the selected entity ("case", "user", etc). The bar
   * automatically pluralises using English rules: `${count} ${label}(s) selected`.
   */
  label: string;
  /** Plural form override. Defaults to `${label}s`. */
  pluralLabel?: string;
  /** Action buttons — typically 2-4 `<Button>`s. */
  children: ReactNode;
  /** Handler for the "Clear" button. */
  onClear: () => void;
  /** Extra classes for the outer element. */
  className?: string;
}

export function BulkActionBar({
  count,
  label,
  pluralLabel,
  children,
  onClear,
  className,
}: BulkActionBarProps) {
  if (count <= 0) return null;

  const plural = pluralLabel ?? `${label}s`;
  const entity = count === 1 ? label : plural;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        // Mobile: fixed bottom bar, full-width, safe-area padding.
        "fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-primary/30 bg-primary px-4 py-3 text-primary-foreground shadow-lg",
        "sm:pb-[env(safe-area-inset-bottom)]",
        // Desktop: sticky, inline, scoped to the list area.
        "sm:static sm:rounded-md sm:border sm:border-primary/40 sm:px-4 sm:py-2 sm:shadow-none",
        className,
      )}
    >
      <span
        aria-live="polite"
        className="text-sm font-semibold whitespace-nowrap"
      >
        {count} {entity} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
