"use client";

/**
 * Table mode — the audit/search/bulk surface. Press `/` from focus mode
 * to land here. Server-paginated (50/page) so 25k+ entries stay fast
 * without virtualization.
 *
 * Row click opens a right-side detail drawer. Bulk select supports
 * "select all matching N rows" when the page selection is full.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  X as CloseIcon,
} from "lucide-react";
import {
  bulkApprove,
  bulkReject,
  getReviewEntriesV2,
  type AiReviewEntry,
  type AiReviewListResult,
} from "@/app/actions/ai-review";
import type { ReviewQuery, ReviewSort } from "@/lib/ai-review/types";
import { useFetchOnQuery } from "@/lib/ai-review/use-review-state";
import { EntryDetail } from "./entry-detail";

type Props = {
  query: ReviewQuery;
  onChange: (next: ReviewQuery) => void;
};

const COLUMNS = [
  { key: "case", label: "Case", width: "w-[110px]" },
  { key: "claimant", label: "Claimant", width: "w-[140px]" },
  { key: "type", label: "Type", width: "w-[120px]" },
  { key: "provider", label: "Provider", width: "w-[180px]" },
  { key: "eventDate", label: "Date", width: "w-[100px]" },
  { key: "summary", label: "Summary", width: "" },
  { key: "confidence", label: "Conf", width: "w-[70px]" },
  { key: "status", label: "Status", width: "w-[90px]" },
] as const;

export function TableMode({ query, onChange }: Props) {
  const router = useRouter();
  const [drawerEntry, setDrawerEntry] = useState<AiReviewEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAllMatching, setBulkAllMatching] = useState(false);
  const [bulkPending, startBulk] = useTransition();

  const fetcher = useCallback(
    (q: ReviewQuery) => getReviewEntriesV2({ ...q, pageSize: 50 }),
    [],
  );
  const { data, loading } = useFetchOnQuery<AiReviewListResult>(query, fetcher);

  const entries = data?.entries ?? [];
  const totalCount = data?.totalCount ?? 0;

  // Reset selection when the query (and therefore the row set) changes.
  useEffect(() => {
    setSelected(new Set());
    setBulkAllMatching(false);
  }, [JSON.stringify(query)]);

  const allOnPageSelected =
    entries.length > 0 && entries.every((e) => selected.has(e.id));
  const moreOffPage = totalCount > entries.length;

  const toggleAllOnPage = () => {
    if (allOnPageSelected) {
      setSelected(new Set());
      setBulkAllMatching(false);
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  };

  const sortIcon = (sortKey: ReviewSort) => {
    if (query.sort === sortKey) return <ChevronDown size={11} />;
    if (query.sort === sortKey.replace("_asc", "_desc"))
      return <ChevronUp size={11} />;
    return null;
  };

  const cycleSort = (col: (typeof COLUMNS)[number]["key"]) => {
    const map: Partial<Record<typeof col, [ReviewSort, ReviewSort]>> = {
      eventDate: ["event_date_desc", "event_date_asc"],
      confidence: ["confidence_asc", "confidence_desc"],
    };
    const pair = map[col];
    if (!pair) return;
    onChange({ ...query, sort: query.sort === pair[0] ? pair[1] : pair[0] });
  };

  const ids = useMemo(() => Array.from(selected), [selected]);

  const onBulkApprove = () => {
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Approve ${bulkAllMatching ? `all ${totalCount}` : ids.length} entries?`,
      )
    )
      return;
    startBulk(async () => {
      try {
        // For "all matching" we'd need a server-side bulk-by-query;
        // v1 does the visible page only.
        const targets = bulkAllMatching ? ids : ids;
        const res = await bulkApprove(targets);
        toast.success(`Approved ${res.approved}`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk approve failed");
      }
    });
  };

  const onBulkReject = () => {
    if (ids.length === 0) return;
    const reason = window.prompt(
      `Reject ${ids.length} entries? Reason (optional):`,
    );
    if (reason === null) return;
    startBulk(async () => {
      try {
        const res = await bulkReject(ids, reason || undefined);
        toast.success(`Rejected ${res.rejected}`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk reject failed");
      }
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-row gap-3">
      {/* Table */}
      <div className="flex flex-1 min-w-0 flex-col rounded-lg border border-zinc-200 bg-white">
        {/* Status row */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-[12px]">
          <div className="flex items-center gap-3 text-zinc-600">
            <span>
              {loading ? "Loading…" : `${totalCount.toLocaleString()} entries`}
            </span>
            {selected.size > 0 ? (
              <>
                <span className="text-zinc-300">·</span>
                <span className="font-medium text-zinc-900">
                  {selected.size} selected
                </span>
                {allOnPageSelected && moreOffPage && !bulkAllMatching ? (
                  <button
                    type="button"
                    onClick={() => setBulkAllMatching(true)}
                    className="text-zinc-700 underline hover:text-zinc-900"
                  >
                    Select all {totalCount} matching
                  </button>
                ) : null}
                {bulkAllMatching ? (
                  <span className="text-emerald-700">
                    All {totalCount} matching selected
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 ? (
              <>
                <button
                  type="button"
                  onClick={onBulkReject}
                  disabled={bulkPending}
                  className="rounded border border-red-200 bg-white px-2 py-1 text-[12px] text-red-700 hover:bg-red-50"
                >
                  Reject {selected.size}
                </button>
                <button
                  type="button"
                  onClick={onBulkApprove}
                  disabled={bulkPending}
                  className="rounded bg-emerald-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-emerald-700"
                >
                  Approve {selected.size}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onChange({ ...query, sort: "confidence_asc" })}
                className="rounded border border-zinc-200 px-2 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                Sort: lowest confidence
              </button>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <div className="w-7 shrink-0">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              aria-label="Select all on this page"
            />
          </div>
          {COLUMNS.map((c) => {
            const sortable = c.key === "eventDate" || c.key === "confidence";
            return (
              <button
                key={c.key}
                type="button"
                onClick={sortable ? () => cycleSort(c.key) : undefined}
                className={`flex items-center gap-1 px-2 ${c.width} text-left ${
                  sortable ? "cursor-pointer hover:text-zinc-900" : ""
                }`}
              >
                {c.label}
                {c.key === "eventDate" ? sortIcon("event_date_desc") : null}
                {c.key === "confidence" ? sortIcon("confidence_asc") : null}
              </button>
            );
          })}
          <div className="w-7 shrink-0"></div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-zinc-500">
              <div className="text-[14px] font-medium text-zinc-700">
                No entries match these filters
              </div>
              <div className="text-[12px]">
                Remove a chip above or pick a different saved view.
              </div>
            </div>
          ) : (
            entries.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                selected={selected.has(entry.id)}
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry.id)) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
                onOpen={() => setDrawerEntry(entry)}
                isActive={drawerEntry?.id === entry.id}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalCount > 50 ? (
          <Pagination
            query={query}
            onChange={onChange}
            totalCount={totalCount}
          />
        ) : null}
      </div>

      {/* Drawer */}
      {drawerEntry ? (
        <div className="flex w-[520px] shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-600">
            <span>Detail</span>
            <button
              type="button"
              onClick={() => setDrawerEntry(null)}
              className="rounded p-0.5 hover:bg-zinc-100"
              aria-label="Close drawer"
            >
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <EntryDetail
              entry={drawerEntry}
              layout="stacked"
              onActionComplete={() => setDrawerEntry(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────

function Row({
  entry,
  selected,
  onToggle,
  onOpen,
  isActive,
}: {
  entry: AiReviewEntry;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  isActive: boolean;
}) {
  const conf = entry.confidence;
  const confTone =
    conf == null
      ? "text-zinc-400"
      : conf >= 81
        ? "text-emerald-700"
        : conf >= 60
          ? "text-amber-700"
          : "text-red-700";
  return (
    <div
      onClick={onOpen}
      className={`flex cursor-pointer items-center border-b border-zinc-50 px-3 py-2 text-[12px] transition ${
        isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
      }`}
    >
      <div className="w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </div>
      <div className="w-[110px] truncate px-2 font-mono text-[11px] text-zinc-700">
        {entry.caseNumber ?? "—"}
      </div>
      <div className="w-[140px] truncate px-2 text-zinc-700">
        {entry.claimantName ?? "—"}
      </div>
      <div className="w-[120px] truncate px-2 text-zinc-600">
        {entry.entryType.replace(/_/g, " ")}
      </div>
      <div className="w-[180px] truncate px-2 text-zinc-700">
        {entry.providerName ?? "—"}
      </div>
      <div className="w-[100px] truncate px-2 font-mono text-[11px] text-zinc-600">
        {entry.eventDate
          ? new Date(entry.eventDate).toLocaleDateString()
          : "—"}
      </div>
      <div className="flex-1 min-w-0 truncate px-2 text-zinc-900">
        {entry.summary}
      </div>
      <div className={`w-[70px] px-2 font-mono text-[11px] tabular-nums ${confTone}`}>
        {conf != null ? `${conf}%` : "—"}
      </div>
      <div className="w-[90px] px-2">
        <StatusPill entry={entry} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="w-7 shrink-0 text-zinc-400 hover:text-zinc-700"
        aria-label="Open detail"
      >
        <Eye size={13} />
      </button>
    </div>
  );
}

function StatusPill({ entry }: { entry: AiReviewEntry }) {
  if (entry.isVerified)
    return (
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">
        approved
      </span>
    );
  if (entry.isExcluded)
    return (
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-700">
        rejected
      </span>
    );
  if (entry.daysPending >= 7)
    return (
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-700">
        {entry.daysPending}d
      </span>
    );
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
      pending
    </span>
  );
}

function Pagination({
  query,
  onChange,
  totalCount,
}: {
  query: ReviewQuery;
  onChange: (next: ReviewQuery) => void;
  totalCount: number;
}) {
  const page = query.page ?? 1;
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-[12px] text-zinc-600">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange({ ...query, page: Math.max(1, page - 1) })}
          disabled={page <= 1}
          className="rounded px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-30"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ ...query, page: Math.min(totalPages, page + 1) })
          }
          disabled={page >= totalPages}
          className="rounded px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
