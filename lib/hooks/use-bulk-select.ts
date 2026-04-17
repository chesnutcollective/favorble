"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Shared bulk-select hook for list surfaces (cases, users, templates, docs).
 *
 * Usage:
 *   const bulk = useBulkSelect(rows, (r) => r.id);
 *   <Checkbox checked={bulk.isSelected(r.id)} onCheckedChange={() => bulk.toggle(r.id)} />
 *   <Checkbox checked={bulk.isAllSelected} onCheckedChange={bulk.toggleAll} />
 *   {bulk.selectedCount > 0 && <BulkActionBar ... onClear={bulk.clear} />}
 *
 * The hook also exposes a `handleRowClick(id, event)` helper that implements
 * Gmail-style shift-click range selection against the last-toggled row. Rows
 * that call it should still render their own Checkbox — this is just a
 * convenience for pages that want shift-click out of the box.
 */
export interface BulkSelectApi<T> {
  /** All currently-visible items this hook was initialised with. */
  items: T[];
  /** Read-only view of the current selection. */
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  /** Items in `items` whose id is in `selectedIds`. */
  selectedItems: T[];
  isSelected: (id: string) => boolean;
  /** True when every currently-visible item is selected (and there's at least one). */
  isAllSelected: boolean;
  /** True when some but not all items are selected — useful for indeterminate state. */
  isSomeSelected: boolean;
  /** Toggle one row. */
  toggle: (id: string) => void;
  /**
   * Toggle all currently-visible rows. If any are selected, clears the
   * selection; otherwise selects all.
   */
  toggleAll: () => void;
  /**
   * Event-aware row toggle. If `event.shiftKey` is pressed and a previous
   * anchor exists, selects the contiguous range between anchor and `id` in
   * `items` order. Otherwise behaves like {@link toggle}.
   */
  handleRowClick: (id: string, event?: { shiftKey?: boolean }) => void;
  /** Clear the entire selection. */
  clear: () => void;
  /** Replace the selection with a specific set of ids. */
  setSelected: (ids: Iterable<string>) => void;
}

export function useBulkSelect<T>(
  items: T[],
  getId: (item: T) => string,
): BulkSelectApi<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Remember the last id the user toggled so shift-click can anchor from it.
  const anchorRef = useRef<string | null>(null);

  const ids = useMemo(() => items.map((it) => getId(it)), [items, getId]);
  const idIndex = useMemo(() => {
    const map = new Map<string, number>();
    ids.forEach((id, i) => map.set(id, i));
    return map;
  }, [ids]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(getId(it))),
    [items, getId, selectedIds],
  );

  const isAllSelected =
    ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const isSomeSelected =
    !isAllSelected && ids.some((id) => selectedIds.has(id));

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = id;
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [ids]);

  const handleRowClick = useCallback(
    (id: string, event?: { shiftKey?: boolean }) => {
      const anchor = anchorRef.current;
      if (event?.shiftKey && anchor && anchor !== id) {
        const fromIdx = idIndex.get(anchor);
        const toIdx = idIndex.get(id);
        if (fromIdx !== undefined && toIdx !== undefined) {
          const [a, b] =
            fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const rangeIds = ids.slice(a, b + 1);
          setSelectedIds((prev) => {
            // If the anchor row is currently selected, extend selection;
            // otherwise treat the range as an unselect.
            const anchorSelected = prev.has(anchor);
            const next = new Set(prev);
            for (const rid of rangeIds) {
              if (anchorSelected) next.add(rid);
              else next.delete(rid);
            }
            return next;
          });
          anchorRef.current = id;
          return;
        }
      }
      toggle(id);
    },
    [idIndex, ids, toggle],
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    anchorRef.current = null;
  }, []);

  const setSelected = useCallback((next: Iterable<string>) => {
    setSelectedIds(new Set(next));
  }, []);

  return {
    items,
    selectedIds,
    selectedCount: selectedIds.size,
    selectedItems,
    isSelected,
    isAllSelected,
    isSomeSelected,
    toggle,
    toggleAll,
    handleRowClick,
    clear,
    setSelected,
  };
}
