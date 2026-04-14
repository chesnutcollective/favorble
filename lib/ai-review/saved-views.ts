import type { ReviewQuery, SavedView } from "./types";
import { parseQuery, stringifyQuery } from "./grammar";

/**
 * Seeded saved views. These are immutable from the UI; users build their
 * own ("user" kind) on top. The seeded set covers the four canonical
 * triage workflows + an "all pending" escape hatch.
 *
 * NOTE: ordering matters — the rail renders in this order, and the first
 * entry is the default landing view when no `view` param is set.
 */
export const SEEDED_VIEWS: SavedView[] = [
  {
    id: "triage",
    label: "Triage",
    kind: "seeded",
    icon: "Sparkles",
    mode: "focus",
    query: { status: "pending", sort: "case_then_confidence" },
  },
  {
    id: "low-confidence",
    label: "Low confidence",
    kind: "seeded",
    icon: "AlertTriangle",
    mode: "table",
    query: {
      status: "pending",
      confidence: { op: "<", value: 60 },
      sort: "confidence_asc",
    },
  },
  {
    id: "stale",
    label: "Stale (>7d)",
    kind: "seeded",
    icon: "Clock",
    mode: "table",
    query: {
      status: "pending",
      minDaysPending: 7,
      sort: "created_asc",
    },
  },
  {
    id: "my-queue",
    label: "My queue",
    kind: "seeded",
    icon: "User",
    mode: "table",
    query: { status: "pending", assignee: "me", sort: "confidence_asc" },
  },
  {
    id: "all-pending",
    label: "All pending",
    kind: "seeded",
    icon: "Inbox",
    mode: "table",
    query: { status: "pending", sort: "created_desc" },
  },
  {
    id: "approved",
    label: "Recently approved",
    kind: "seeded",
    icon: "CheckCircle",
    mode: "table",
    query: { status: "approved", sort: "created_desc" },
  },
  {
    id: "rejected",
    label: "Recently rejected",
    kind: "seeded",
    icon: "XCircle",
    mode: "table",
    query: { status: "rejected", sort: "created_desc" },
  },
];

export function findSeededView(id: string): SavedView | undefined {
  return SEEDED_VIEWS.find((v) => v.id === id);
}

/**
 * Encode a (mode + query) state into a URL query-string. Keeps the URL
 * legible: ?mode=focus&q=case:HS-05827+confidence:<60. Power-users can
 * share links; back/forward navigation Just Works.
 */
export function encodeStateToUrl(state: {
  mode: string;
  query: ReviewQuery;
  view?: string;
}): string {
  const params = new URLSearchParams();
  if (state.mode && state.mode !== "focus") params.set("mode", state.mode);
  if (state.view) params.set("view", state.view);
  const q = stringifyQuery(state.query);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function decodeStateFromUrl(searchParams: URLSearchParams): {
  mode: "focus" | "table" | "canvas";
  query: ReviewQuery;
  view?: string;
} {
  const view = searchParams.get("view") ?? undefined;
  const seeded = view ? findSeededView(view) : undefined;

  const rawMode = searchParams.get("mode");
  const mode =
    rawMode === "table" || rawMode === "canvas" || rawMode === "focus"
      ? rawMode
      : (seeded?.mode ?? "focus");

  const rawQ = searchParams.get("q");
  if (rawQ) {
    return { mode, view, query: parseQuery(rawQ).query };
  }
  return { mode, view, query: seeded?.query ?? { status: "pending" } };
}
