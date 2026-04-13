"use client";

/**
 * AI Review workspace — the page wrapper that owns mode switching,
 * shared toolbar, and the saved-views rail. The three modes are
 * peers; each gets the same {query, onChange} contract and renders
 * the entries however it wants.
 *
 * Global key handlers (only fire when not typing in an input):
 *   /   focus the search bar
 *   F   focus mode
 *   T   table mode
 *   V   canvas mode
 *   ?   open shortcut help
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, List, ScatterChart } from "lucide-react";
import {
  getFacetCounts,
  type AiReviewEntry,
  type AiReviewListResult,
} from "@/app/actions/ai-review";
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
import { ViewsRail } from "@/components/ai-review/views-rail";

export function AiReviewWorkspace({
  initialMode,
  initialView,
  initialQuery,
  initialFacets,
  initialFocusEntry,
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
  const barWrapRef = useRef<HTMLDivElement>(null);

  // Effective state — server-rendered initial values used until the URL
  // hook has hydrated. Subsequent renders use the hook's state.
  const effectiveMode = mode ?? initialMode;
  const effectiveQuery = query ?? initialQuery;
  const effectiveView = activeViewId ?? initialView;

  // Live facet counts so the chip strip + rail always show fresh numbers.
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
        tag === "input" || tag === "textarea" || tag === "select";
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" && !inEditable) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "/" && !inEditable) {
        e.preventDefault();
        const input = barWrapRef.current?.querySelector("input");
        input?.focus();
        if (effectiveMode === "focus") setMode("table");
        return;
      }
      if (inEditable) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setMode("focus");
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setMode("table");
      } else if (e.key.toLowerCase() === "v") {
        e.preventDefault();
        setMode("canvas");
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveMode, setMode]);

  return (
    <div className="-m-3 flex h-[calc(100vh-var(--view-as-banner-h,0px)-3.5rem)] sm:-m-4 md:-m-8">
      <ViewsRail
        activeViewId={effectiveView}
        facets={liveFacets}
        onPick={(picked) => {
          setView(picked.view);
          setMode(picked.mode);
          setQuery(picked.query);
        }}
      />
      <div className="flex flex-1 min-w-0 flex-col gap-3 overflow-hidden p-4">
        {/* Bar + mode switcher */}
        <div className="flex items-start gap-3">
          <div ref={barWrapRef} className="flex-1">
            <CopilotBar
              query={effectiveQuery}
              facets={liveFacets}
              onChange={setQuery}
            />
          </div>
          <ModeSwitcher mode={effectiveMode} onChange={setMode} />
        </div>

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
            <TableMode query={effectiveQuery} onChange={setQuery} />
          ) : (
            <CanvasMode query={effectiveQuery} />
          )}
        </div>
      </div>

      {showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
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
    { mode: "canvas", label: "Canvas", icon: ScatterChart, shortcut: "V" },
  ];
  return (
    <div className="flex items-center gap-0 rounded-lg border border-zinc-200 bg-white p-0.5">
      {buttons.map((b) => {
        const Icon = b.icon;
        const active = mode === b.mode;
        return (
          <button
            key={b.mode}
            type="button"
            onClick={() => onChange(b.mode)}
            title={`${b.label} (${b.shortcut})`}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Icon size={13} />
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Help overlay ─────────────────────────────────────────────────

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const groups: Array<{
    title: string;
    rows: Array<[string, string]>;
  }> = [
    {
      title: "Modes",
      rows: [
        ["F", "Focus mode (one entry, source PDF beside)"],
        ["T", "Table mode (filter, sort, bulk)"],
        ["V", "Canvas mode (scatter, find patterns)"],
        ["/", "Focus the search bar (drops into table)"],
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
        ["S", "Skip — re-queue at end of session"],
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[640px] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-900">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
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
