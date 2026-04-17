"use client";

/**
 * Canvas mode — 2D scatter where you spot patterns.
 *
 * Axes: X = eventDate (chronology), Y = confidence (0–100).
 * Color = provider (stable hash). Shape = status. Click → drawer.
 *
 * Pure SVG so we don't add a charting dep. At 50–500 points (the size
 * of a typical filtered query) this performs fine; for larger working
 * sets the user filters down via the bar first.
 */

import { useCallback, useMemo, useState } from "react";
import { X as CloseIcon } from "lucide-react";
import {
  getReviewEntriesV2,
  type AiReviewEntry,
  type AiReviewListResult,
} from "@/app/actions/ai-review";
import type { ReviewQuery } from "@/lib/ai-review/types";
import { useFetchOnQuery } from "@/lib/ai-review/use-review-state";
import { EntryDetail } from "./entry-detail";

const PALETTE = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#84CC16",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#A855F7",
];

function colorFor(name: string | null): string {
  if (!name) return "#9CA3AF";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function CanvasMode({
  query,
  initialList,
  initialQueryKey,
}: {
  query: ReviewQuery;
  /** Server-rendered initial payload to avoid a "Loading…" flash. */
  initialList?: AiReviewListResult;
  /** JSON stringified query the initialList was fetched for. */
  initialQueryKey?: string;
}) {
  const fetcher = useCallback(
    (q: ReviewQuery) => getReviewEntriesV2({ ...q, pageSize: 500 }),
    [],
  );
  const hydrate =
    initialList && initialQueryKey === JSON.stringify(query)
      ? initialList
      : null;
  const { data, loading } = useFetchOnQuery<AiReviewListResult>(
    query,
    fetcher,
    200,
    hydrate,
  );
  const entries = data?.entries ?? [];

  const [hover, setHover] = useState<AiReviewEntry | null>(null);
  const [selected, setSelected] = useState<AiReviewEntry | null>(null);

  // Compute time bounds from the data; default to a sane window.
  const bounds = useMemo(() => {
    const dates = entries
      .map((e) => (e.eventDate ? new Date(e.eventDate).getTime() : null))
      .filter((d): d is number => d != null);
    const now = Date.now();
    const minT = dates.length
      ? Math.min(...dates)
      : now - 365 * 24 * 60 * 60 * 1000;
    const maxT = dates.length ? Math.max(...dates) : now;
    return { minT, maxT };
  }, [entries]);

  const W = 980;
  const H = 540;
  const PAD = 48;

  const xScale = (t: number) => {
    if (bounds.maxT === bounds.minT)
      return PAD + (W - 2 * PAD) / 2;
    return PAD + ((t - bounds.minT) / (bounds.maxT - bounds.minT)) * (W - 2 * PAD);
  };
  const yScale = (c: number | null) => {
    const v = c ?? 0;
    return H - PAD - (v / 100) * (H - 2 * PAD);
  };

  return (
    <div className="flex h-full min-h-0 flex-row gap-3">
      <div className="relative flex flex-1 flex-col rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-[12px] text-zinc-600">
          <span>
            {loading
              ? "Loading…"
              : `${entries.length} entries · X = event date · Y = confidence`}
          </span>
          <span className="text-zinc-400">
            click a point to inspect · color = provider
          </span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {entries.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">
              No matching entries to plot.
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-full w-full"
              role="img"
              aria-label="Scatter plot of review entries"
            >
              {/* Background bands for confidence regions */}
              <rect x={PAD} y={yScale(100)} width={W - 2 * PAD} height={yScale(81) - yScale(100)} fill="#ECFDF5" />
              <rect x={PAD} y={yScale(80)} width={W - 2 * PAD} height={yScale(60) - yScale(80)} fill="#FFFBEB" />
              <rect x={PAD} y={yScale(59)} width={W - 2 * PAD} height={yScale(0) - yScale(59)} fill="#FEF2F2" />

              {/* Y-axis ticks */}
              {[0, 20, 40, 60, 80, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={PAD}
                    x2={W - PAD}
                    y1={yScale(v)}
                    y2={yScale(v)}
                    stroke="#E5E7EB"
                    strokeDasharray="2,3"
                  />
                  <text
                    x={PAD - 6}
                    y={yScale(v) + 3}
                    fontSize={9}
                    textAnchor="end"
                    fill="#9CA3AF"
                    fontFamily="monospace"
                  >
                    {v}
                  </text>
                </g>
              ))}

              {/* X-axis labels (4 evenly spaced dates) */}
              {Array.from({ length: 5 }).map((_, i) => {
                const t = bounds.minT + ((bounds.maxT - bounds.minT) * i) / 4;
                const x = xScale(t);
                return (
                  <g key={i}>
                    <text
                      x={x}
                      y={H - PAD + 14}
                      fontSize={9}
                      textAnchor="middle"
                      fill="#9CA3AF"
                      fontFamily="monospace"
                    >
                      {new Date(t).toISOString().slice(0, 10)}
                    </text>
                  </g>
                );
              })}

              {/* Axis labels */}
              <text x={PAD} y={PAD - 12} fontSize={10} fill="#6B7280">
                ↑ confidence
              </text>
              <text
                x={W - PAD}
                y={H - PAD + 28}
                fontSize={10}
                fill="#6B7280"
                textAnchor="end"
              >
                event date →
              </text>

              {/* Points */}
              {entries.map((e) => {
                if (!e.eventDate) return null;
                const x = xScale(new Date(e.eventDate).getTime());
                const y = yScale(e.confidence);
                const r = 4 + Math.min(6, e.diagnoses.length);
                const fill = colorFor(e.providerName);
                const isApproved = e.isVerified;
                const isRejected = e.isExcluded;
                return (
                  <g
                    key={e.id}
                    onMouseEnter={() => setHover(e)}
                    onMouseLeave={() =>
                      setHover((h) => (h?.id === e.id ? null : h))
                    }
                    onClick={() => setSelected(e)}
                    style={{ cursor: "pointer" }}
                  >
                    {isApproved ? (
                      <rect
                        x={x - r}
                        y={y - r}
                        width={r * 2}
                        height={r * 2}
                        fill={fill}
                        opacity={0.55}
                        stroke={fill}
                      />
                    ) : isRejected ? (
                      <g>
                        <line
                          x1={x - r}
                          y1={y - r}
                          x2={x + r}
                          y2={y + r}
                          stroke={fill}
                          strokeWidth={2}
                        />
                        <line
                          x1={x - r}
                          y1={y + r}
                          x2={x + r}
                          y2={y - r}
                          stroke={fill}
                          strokeWidth={2}
                        />
                      </g>
                    ) : (
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill={fill}
                        opacity={0.7}
                        stroke="white"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Hover card */}
        {hover ? (
          <div className="pointer-events-none absolute right-4 top-12 max-w-xs rounded-md border border-zinc-200 bg-white p-3 text-[12px] shadow-lg">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {hover.entryType.replace(/_/g, " ")} · {hover.confidence ?? "—"}%
            </div>
            <div className="mt-1 truncate text-[12px] text-zinc-900">
              {hover.summary}
            </div>
            <div className="mt-1 text-[11px] text-zinc-600">
              {hover.providerName ?? "Unknown provider"}
            </div>
            <div className="text-[11px] text-zinc-500">
              {hover.caseNumber} ·{" "}
              {hover.eventDate
                ? new Date(hover.eventDate).toLocaleDateString()
                : "—"}
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="flex w-[520px] shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-600">
            <span>Detail</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded p-0.5 hover:bg-zinc-100"
              aria-label="Close drawer"
            >
              <CloseIcon size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <EntryDetail
              entry={selected}
              layout="stacked"
              onActionComplete={() => setSelected(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
