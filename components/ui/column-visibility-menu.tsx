"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColumnDef = {
  /** Stable key used for storage + lookup. */
  key: string;
  /** Human-readable label shown in the menu. */
  label: string;
  /** Whether the column is visible by default. */
  defaultVisible?: boolean;
  /** If true, the column cannot be toggled off (always shown). */
  alwaysVisible?: boolean;
};

export type ColumnVisibilityMenuProps = {
  /**
   * Unique localStorage key. Consumers pass e.g. `favorble.cases.visibleColumns.v1`.
   */
  storageKey: string;
  /** Column definitions. Order drives the menu order. */
  columns: ColumnDef[];
  /**
   * Controlled visibility change callback. Receives the Set of visible keys
   * (always-visible keys included).
   */
  onChange?: (visible: Set<string>) => void;
  /** Optional trigger button label (defaults to no label / icon only). */
  label?: string;
  /** Optional class applied to the trigger button. */
  className?: string;
  /** Side the menu opens to. Defaults to "bottom". */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment of the menu relative to the trigger. Defaults to "end". */
  align?: "start" | "center" | "end";
};

/**
 * Build the initial visibility Set from column defaults.
 */
function buildDefaultVisible(columns: ColumnDef[]): Set<string> {
  const set = new Set<string>();
  for (const col of columns) {
    if (col.alwaysVisible || col.defaultVisible !== false) {
      set.add(col.key);
    }
  }
  return set;
}

/**
 * Load persisted visible-keys from localStorage. Returns null on miss/failure
 * so callers can fall back to defaults.
 */
function loadVisibleFromStorage(
  storageKey: string,
  columns: ColumnDef[],
): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const next = new Set<string>();
    for (const key of parsed) {
      if (typeof key === "string") next.add(key);
    }
    // Guarantee always-visible columns are present even if storage was stale.
    for (const col of columns) {
      if (col.alwaysVisible) next.add(col.key);
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * A generic column-visibility gear menu. Persists the user's selection to
 * localStorage under `storageKey` and calls `onChange` whenever the set
 * changes.
 *
 * Usage:
 * ```tsx
 * <ColumnVisibilityMenu
 *   storageKey="favorble.cases.visibleColumns.v1"
 *   columns={[
 *     { key: "claimant", label: "Claimant", defaultVisible: true },
 *     { key: "stage", label: "Stage", defaultVisible: true },
 *   ]}
 *   onChange={setVisible}
 * />
 * ```
 */
export function ColumnVisibilityMenu({
  storageKey,
  columns,
  onChange,
  label,
  className,
  side = "bottom",
  align = "end",
}: ColumnVisibilityMenuProps) {
  const defaults = useMemo(() => buildDefaultVisible(columns), [columns]);
  const [visible, setVisible] = useState<Set<string>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  // Keep latest refs so the hydration effect can stay mount-only without
  // stale closures. We intentionally do NOT want to re-hydrate on every
  // render when `columns`/`onChange`/`defaults` change identity — that would
  // clobber user selections.
  const columnsRef = useRef(columns);
  const defaultsRef = useRef(defaults);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    columnsRef.current = columns;
    defaultsRef.current = defaults;
    onChangeRef.current = onChange;
  });

  // Hydrate from localStorage on mount / when storageKey changes (SSR-safe).
  useEffect(() => {
    const loaded = loadVisibleFromStorage(storageKey, columnsRef.current);
    if (loaded) {
      setVisible(loaded);
      onChangeRef.current?.(loaded);
    } else {
      onChangeRef.current?.(defaultsRef.current);
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist whenever visibility changes after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(visible)),
      );
    } catch {
      // Ignore storage quota / private-mode errors.
    }
  }, [visible, hydrated, storageKey]);

  const handleToggle = useCallback(
    (key: string, nextChecked: boolean) => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (nextChecked) {
          next.add(key);
        } else {
          next.delete(key);
        }
        // Always-visible guard.
        for (const col of columns) {
          if (col.alwaysVisible) next.add(col.key);
        }
        onChange?.(next);
        return next;
      });
    },
    [columns, onChange],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          aria-label="Toggle columns"
        >
          <HugeiconsIcon
            icon={Settings02Icon}
            size={14}
            className={label ? "mr-1.5" : undefined}
          />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-52">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => {
          const isVisible = visible.has(col.key);
          return (
            <DropdownMenuCheckboxItem
              key={col.key}
              checked={isVisible}
              disabled={col.alwaysVisible}
              onCheckedChange={(checked) =>
                handleToggle(col.key, Boolean(checked))
              }
              // Prevent the menu from closing on each toggle so users can
              // flip multiple columns quickly.
              onSelect={(event) => event.preventDefault()}
            >
              {col.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
