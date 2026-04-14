"use client";

/**
 * AI Review workspace — owns mode switching + the shared toolbar.
 *
 * Layout: a single column inside the parent app shell. The seeded views
 * are a horizontal quick-filter strip (NOT a left rail) because the app
 * already provides two left columns (icon rail + persona panel).
 *
 * Global key handlers (only fire when not typing in an input):
 *   /   focus the search bar (no mode switch — caller can press T after)
 *   F   focus mode
 *   T   table mode
 *   V   canvas mode
 *   ?   open shortcut help
 *   Esc close help / drawers
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Inbox,
  LayoutGrid,
  List,
  ScatterChart,
  Sparkles,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  getFacetCounts,
  type AiReviewEntry,
  type AiReviewListResult,
} from "@/app/actions/ai-review";
import { SEEDED_VIEWS } from "@/lib/ai-review/saved-views";
import type {
  FacetCounts,
  ReviewMode,
  ReviewQuery,
} from "@/lib/ai-review/types";
import { useFetchOnQuery, useReviewState } from "@/lib/ai-review/use-review-state";
import { CanvasMode } from "@/components/ai-review/canvas-mode";
import { CopilotBar } from "@/components/ai-review/copilot-bar";
import { FocusMode } from "@/components/ai-review/focus-mode";
import { TableMode } from "@/components/ai-review/table-mode";

const VIEW_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  AlertTriangle,
  Clock,
  User,
  Inbox,
  CheckCircle,
  XCircle,
};

export function AiReviewWorkspace({
  initialMode,
  initialView,
  initialQuery,
  initialFacets,
  initialFocusEntry,
  initialList,
}: {
  initialMode: ReviewMode;
  initialView?: string;
  initialQuery: ReviewQuery;
  initialFacets: FacetCounts;
  initialFocusEntry: AiReviewEntry | null;
  initialList: AiReviewListResult;
}) {
  const { mode, query, activeViewId, setMode, setQuery, setView } =
    useReviewState();
  const [showHelp, setShowHelp] = useState(false);
  const barInputRef = useRef<HTMLInputElement>(null);

  const effectiveMode = mode ?? initialMode;
  const effectiveQuery = query ?? initialQuery;
  const effectiveView = activeViewId ?? initialView;

  const facetFetcher = useCallback(
    (q: ReviewQuery) => getFacetCounts(q),
    [],
  );
  const { data: facets } = useFetchOnQuery<FacetCounts>(
    effectiveQuery,
    facetFetcher,
    400,
  );
  const liveFacets = facets ?? initialFacets;

  // Global key handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement | null)?.isContentEditable === true;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Esc + ? always work, even while in an input.
      if (e.key === "Escape") {
        if (showHelp) setShowHelp(false);
        return;
      }
      if (e.key === "?" && !inEditable) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "/" && !inEditable) {
        e.preventDefault();
        // Focus the bar but DON'T switch mode — preserves whatever the
        // user was doing in focus mode.
        barInputRef.current?.focus();
        return;
      }
      if (inEditable) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setMode("focus");
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setMode("table");
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setMode("canvas");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMode, showHelp]);

  return (
    <main
      aria-label="AI review queue"
      className="flex h-full min-h-0 flex-col gap-3"
    >
      {/* Toolbar: bar + mode switcher */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <CopilotBar
            ref={barInputRef}
            query={effectiveQuery}
            facets={liveFacets}
            onChange={setQuery}
            onHelpClick={() => setShowHelp(true)}
          />
        </div>
        <ModeSwitcher mode={effectiveMode} onChange={setMode} />
      </div>

      {/* Quick filters (seeded views) */}
      <QuickFilters
        activeViewId={effectiveView}
        facets={liveFacets}
        onPick={(picked) => {
          setView(picked.view);
          setMode(picked.mode);
          setQuery(picked.query);
        }}
      />

      {/* Active mode */}
      <div className="flex-1 min-h-0">
        {effectiveMode === "focus" ? (
          <FocusMode
            query={effectiveQuery}
            initialEntry={initialFocusEntry}
            emptyMessage={
              liveFacets.status.pending === 0
                ? "Inbox zero — every AI extraction has been reviewed."
                : undefined
            }
          />
        ) : effectiveMode === "table" ? (
          <TableMode
            query={effectiveQuery}
            onChange={setQuery}
            initialList={initialList}
            initialQueryKey={JSON.stringify(initialQuery)}
          />
        ) : (
          <CanvasMode
            query={effectiveQuery}
            initialList={initialList}
            initialQueryKey={JSON.stringify(initialQuery)}
          />
        )}
      </div>

      {showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
    </main>
  );
}

// ─── Quick filter strip ───────────────────────────────────────────

function QuickFilters({
  activeViewId,
  facets,
  onPick,
}: {
  activeViewId?: string;
  facets?: FacetCounts | null;
  onPick: (next: { view: string; mode: ReviewMode; query: ReviewQuery }) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Saved views"
      className="flex flex-wrap items-center gap-1.5"
    >
      {SEEDED_VIEWS.map((v) => {
        const Icon: LucideIcon = (v.icon ? VIEW_ICONS[v.icon] : undefined) ?? Inbox;
        const isActive = activeViewId === v.id;
        const count = countForView(v.id, facets);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() =>
              onPick({
                view: v.id,
                mode: v.mode ?? "table",
                query: v.query,
              })
            }
            className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Icon size={12} aria-hidden />
            <span>{v.label}</span>
            {count != null ? (
              <span
                className={`tabular-nums text-[11px] ${
                  isActive ? "text-zinc-300" : "text-zinc-500"
                }`}
                aria-label={`${count} entries`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function countForView(
  id: string,
  facets: FacetCounts | null | undefined,
): number | null {
  if (!facets) return null;
  switch (id) {
    case "triage":
    case "all-pending":
      return facets.status.pending;
    case "low-confidence":
      return facets.confidence.low;
    case "approved":
      return facets.status.approved;
    case "rejected":
      return facets.status.rejected;
    default:
      return null;
  }
}

// ─── Mode switcher ────────────────────────────────────────────────

function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: ReviewMode;
  onChange: (m: ReviewMode) => void;
}) {
  const buttons: Array<{
    mode: ReviewMode;
    label: string;
    icon: typeof LayoutGrid;
    shortcut: string;
  }> = [
    { mode: "focus", label: "Focus", icon: LayoutGrid, shortcut: "F" },
    { mode: "table", label: "Table", icon: List, shortcut: "T" },
    { mode: "canvas", label: "Canvas", icon: ScatterChart, shortcut: "G" },
  ];
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="flex shrink-0 items-center gap-0 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm"
    >
      {buttons.map((b) => {
        const Icon = b.icon;
        const active = mode === b.mode;
        return (
          <button
            key={b.mode}
            type="button"
            role="tab"
            aria-selected={active}
            aria-keyshortcuts={b.shortcut}
            onClick={() => onChange(b.mode)}
            title={`${b.label} (${b.shortcut})`}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Icon size={14} aria-hidden />
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Help overlay ─────────────────────────────────────────────────

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + restore: focus the dialog on open, restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: "Modes",
      rows: [
        ["F", "Focus mode"],
        ["T", "Table mode"],
        ["G", "Canvas (graph) mode"],
        ["/", "Focus the search bar"],
        ["?", "Toggle this help"],
        ["Esc", "Close dialogs / drawers"],
      ],
    },
    {
      title: "Focus mode",
      rows: [
        ["A", "Approve current entry"],
        ["R", "Reject current entry"],
        ["E", "Edit the summary"],
        ["J / N", "Next entry"],
        ["K / P", "Previous entry"],
        ["S", "Skip — re-queue this session"],
        ["C", "Lock to current case (toggle)"],
      ],
    },
    {
      title: "Search grammar",
      rows: [
        ["case:HS-05827", "Case number (fuzzy fallback)"],
        ['provider:"dr. patel"', "Quoted multi-word"],
        ["confidence:<60", "Comparator filter"],
        ["status:pending", "pending|approved|rejected|all"],
        ["date:2026-01..2026-04", "Range or single day"],
        ["pending:>7d", "Overdue threshold"],
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-review-help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[80vh] w-[640px] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            id="ai-review-help-title"
            className="text-[15px] font-semibold text-zinc-900"
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Close help"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {g.title}
              </div>
              <div className="mt-1 grid grid-cols-1 gap-y-1 sm:grid-cols-2">
                {g.rows.map(([key, label]) => (
                  <div
                    key={`${g.title}-${key}`}
                    className="flex items-center gap-2 text-[12px]"
                  >
                    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
                      {key}
                    </kbd>
                    <span className="text-zinc-700">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
