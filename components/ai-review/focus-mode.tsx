"use client";

/**
 * Focus mode — the default landing experience for /admin/ai-review.
 *
 * One entry, source PDF beside it, AI rationale, single-key actions:
 *   A / R / E   approve / reject / edit
 *   J / N       advance to next entry
 *   K           previous (in-session history)
 *   S           skip — re-queue at the end of the session
 *   C           lock to current case (vs. let scheduler hop)
 *   ?           help
 *   /           drop into search/table mode
 *   V           switch to canvas mode
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Lock, Sparkles } from "lucide-react";
import {
  approveExtraction,
  getNextEntry,
  rejectExtraction,
} from "@/app/actions/ai-review";
import type { AiReviewEntry } from "@/app/actions/ai-review";
import type { ReviewQuery } from "@/lib/ai-review/types";
import { EntryDetail } from "./entry-detail";

export function FocusMode({
  query,
  initialEntry,
  emptyMessage,
}: {
  query: ReviewQuery;
  initialEntry: AiReviewEntry | null;
  emptyMessage?: string;
}) {
  const [entry, setEntry] = useState<AiReviewEntry | null>(initialEntry);
  const [history, setHistory] = useState<AiReviewEntry[]>(
    initialEntry ? [initialEntry] : [],
  );
  const [historyIndex, setHistoryIndex] = useState(initialEntry ? 0 : -1);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [lockedCaseId, setLockedCaseId] = useState<string | undefined>(
    initialEntry?.caseId,
  );
  const [reviewedCount, setReviewedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const queryKey = JSON.stringify(query);
  const advanceLockRef = useRef(false);

  // When the active query changes, reset the session and refetch the head.
  useEffect(() => {
    setHistory(initialEntry ? [initialEntry] : []);
    setHistoryIndex(initialEntry ? 0 : -1);
    setEntry(initialEntry);
    setLockedCaseId(initialEntry?.caseId);
    setSkipped([]);
    setReviewedCount(0);
  }, [queryKey]);

  const advance = useCallback(
    async (countAsReviewed: boolean) => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      try {
        const nextSkipIds = [
          ...history.map((h) => h.id),
          ...skipped,
        ].filter(Boolean);
        const next = await getNextEntry(query, {
          currentCaseId: lockedCaseId,
          skipIds: nextSkipIds,
        });
        if (next) {
          setHistory((h) => [...h, next]);
          setHistoryIndex((i) => i + 1);
          setEntry(next);
          if (lockedCaseId !== next.caseId) setLockedCaseId(next.caseId);
        } else if (lockedCaseId) {
          // Current case drained — try without lock.
          setLockedCaseId(undefined);
          const fallback = await getNextEntry(query, {
            skipIds: nextSkipIds,
          });
          if (fallback) {
            setHistory((h) => [...h, fallback]);
            setHistoryIndex((i) => i + 1);
            setEntry(fallback);
            setLockedCaseId(fallback.caseId);
          } else {
            setEntry(null);
          }
        } else {
          setEntry(null);
        }
        if (countAsReviewed) setReviewedCount((n) => n + 1);
      } finally {
        advanceLockRef.current = false;
      }
    },
    [history, query, skipped, lockedCaseId],
  );

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    setEntry(history[i]);
    setLockedCaseId(history[i]?.caseId);
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      startTransition(() => {
        void advance(false);
      });
      return;
    }
    const i = historyIndex + 1;
    setHistoryIndex(i);
    setEntry(history[i]);
    setLockedCaseId(history[i]?.caseId);
  }, [advance, history, historyIndex]);

  const skip = useCallback(() => {
    if (entry) setSkipped((s) => [...s, entry.id]);
    startTransition(() => {
      void advance(false);
    });
  }, [advance, entry]);

  // After approve/reject succeeds, advance and count.
  const onActionComplete = useCallback(() => {
    startTransition(() => {
      void advance(true);
    });
  }, [advance]);

  const router = useRouter();

  const approveCurrent = useCallback(() => {
    if (!entry) return;
    startTransition(async () => {
      try {
        await approveExtraction(entry.id);
        toast.success("Approved", { duration: 1500 });
        onActionComplete();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed");
      }
    });
  }, [entry, onActionComplete, router]);

  const rejectCurrent = useCallback(() => {
    if (!entry) return;
    startTransition(async () => {
      try {
        await rejectExtraction(entry.id);
        toast.success("Rejected", { duration: 1500 });
        onActionComplete();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }, [entry, onActionComplete, router]);

  // Keyboard shortcuts. Bound to document; ignored when focus is in an
  // editable field so the user can edit the summary normally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable === true;
      if (inEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "j":
        case "n":
          e.preventDefault();
          goForward();
          break;
        case "k":
        case "p":
          e.preventDefault();
          goBack();
          break;
        case "s":
          e.preventDefault();
          skip();
          break;
        case "c":
          e.preventDefault();
          setLockedCaseId((cur) =>
            cur ? undefined : (entry?.caseId ?? undefined),
          );
          break;
        case "a":
          e.preventDefault();
          approveCurrent();
          break;
        case "r":
          e.preventDefault();
          rejectCurrent();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    goBack,
    goForward,
    skip,
    entry?.caseId,
    approveCurrent,
    rejectCurrent,
  ]);

  // ─── Render ────────────────────────────────────────────────────

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center">
        <Sparkles size={28} className="text-emerald-500" aria-hidden="true" />
        <div className="text-[15px] font-medium text-zinc-900">
          Queue is clear
        </div>
        <div className="max-w-sm text-[13px] text-zinc-600">
          {emptyMessage ??
            "No pending entries match your filters. Try a different saved view, or press / to open the table."}
        </div>
        {reviewedCount > 0 ? (
          <div className="text-[12px] text-zinc-500">
            You reviewed {reviewedCount} this session.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Status strip */}
      <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12px]">
        <div className="flex items-center gap-3 text-zinc-600">
          <button
            type="button"
            onClick={goBack}
            disabled={historyIndex <= 0}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100 disabled:opacity-30"
            title="Previous (K)"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Prev
          </button>
          <button
            type="button"
            onClick={goForward}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100"
            title="Next (J)"
          >
            Next
            <ArrowRight size={12} aria-hidden="true" />
          </button>
          <span className="text-zinc-300">·</span>
          <button
            type="button"
            onClick={() =>
              setLockedCaseId((cur) => (cur ? undefined : entry.caseId))
            }
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              lockedCaseId
                ? "bg-amber-50 text-amber-800"
                : "text-zinc-500 hover:bg-zinc-100"
            }`}
            title="Lock to current case (C)"
          >
            <Lock size={11} aria-hidden="true" />
            {lockedCaseId
              ? `Locked: ${entry.caseNumber ?? "case"}`
              : "Auto-pick case"}
          </button>
          <button
            type="button"
            onClick={skip}
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100"
            title="Skip (S)"
          >
            Skip
          </button>
        </div>
        <div className="flex items-center gap-3 text-zinc-500">
          <span>{reviewedCount} reviewed this session</span>
          {isPending ? <span className="font-mono text-zinc-400">…</span> : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <EntryDetail
          entry={entry}
          layout="split"
          onActionComplete={onActionComplete}
        />
      </div>

      <FatigueNudge reviewedCount={reviewedCount} />
    </div>
  );
}

function FatigueNudge({ reviewedCount }: { reviewedCount: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (reviewedCount > 0 && reviewedCount % 50 === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        <span>
          You&apos;ve reviewed {reviewedCount} this session — consider a short
          break to maintain consistency.
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded px-2 py-0.5 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}
