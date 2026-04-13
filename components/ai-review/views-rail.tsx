"use client";

/**
 * Left-rail view picker. Renders the seeded views with live counts pulled
 * from the facet response. Active view is highlighted; clicking applies
 * the view's query AND mode in one shot.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Inbox,
  Sparkles,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SEEDED_VIEWS } from "@/lib/ai-review/saved-views";
import type { FacetCounts, ReviewMode, ReviewQuery } from "@/lib/ai-review/types";

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  AlertTriangle,
  Clock,
  User,
  Inbox,
  CheckCircle,
  XCircle,
};

export function ViewsRail({
  activeViewId,
  facets,
  onPick,
}: {
  activeViewId?: string;
  facets?: FacetCounts | null;
  onPick: (next: { view: string; mode: ReviewMode; query: ReviewQuery }) => void;
}) {
  return (
    <nav
      aria-label="Saved views"
      className="flex w-56 flex-col gap-0.5 border-r border-zinc-100 bg-zinc-50/40 p-3"
    >
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Views
      </div>
      {SEEDED_VIEWS.map((v) => {
        const Icon: LucideIcon = (v.icon ? ICONS[v.icon] : undefined) ?? Inbox;
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
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Icon size={14} aria-hidden />
            <span className="flex-1 truncate">{v.label}</span>
            {count != null ? (
              <span
                className={`tabular-nums text-[11px] ${
                  isActive ? "text-zinc-200" : "text-zinc-500"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
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
