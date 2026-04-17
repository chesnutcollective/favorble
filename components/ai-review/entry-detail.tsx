"use client";

/**
 * Entry detail body — used by Focus Mode (full pane) AND by the right
 * drawer in Table/Canvas modes. Renders the entry fields, per-field
 * confidence, source highlights, and inline approve/reject/edit actions.
 *
 * The PDF panel is opt-in: focus mode renders it side-by-side, the
 * drawer renders it in a tab so the entry fields stay scannable.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Edit3, Loader2 } from "lucide-react";
import {
  approveExtraction,
  editExtraction,
  rejectExtraction,
} from "@/app/actions/ai-review";
import { getDocumentUrl } from "@/app/actions/documents";
import { DocumentPreview } from "@/components/documents/document-preview";
import type { AiReviewEntry } from "@/app/actions/ai-review";

export function EntryDetail({
  entry,
  onActionComplete,
  layout = "stacked",
}: {
  entry: AiReviewEntry;
  /** Fired after a successful approve/reject/edit so caller can advance. */
  onActionComplete?: () => void;
  /** "stacked" stacks fields above PDF; "split" puts PDF in a sibling pane. */
  layout?: "stacked" | "split" | "fields-only";
}) {
  return (
    <div
      className={`flex h-full ${layout === "split" ? "flex-row" : "flex-col"} gap-4`}
    >
      <div className={layout === "split" ? "w-[460px] shrink-0" : "w-full"}>
        <FieldPane entry={entry} onActionComplete={onActionComplete} />
      </div>
      {layout !== "fields-only" ? (
        <div className="flex-1 min-w-0">
          <SourcePane entry={entry} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Field pane ───────────────────────────────────────────────────

function FieldPane({
  entry,
  onActionComplete,
}: {
  entry: AiReviewEntry;
  onActionComplete?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingSummary, setEditingSummary] = useState(false);
  const [draftSummary, setDraftSummary] = useState(entry.summary);

  useEffect(() => {
    setDraftSummary(entry.summary);
    setEditingSummary(false);
  }, [entry.id, entry.summary]);

  const onApprove = () => {
    startTransition(async () => {
      try {
        await approveExtraction(entry.id);
        toast.success("Approved", { duration: 1500 });
        onActionComplete?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed");
      }
    });
  };

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const submitReject = () => {
    setShowReject(false);
    startTransition(async () => {
      try {
        await rejectExtraction(entry.id, rejectReason || undefined);
        toast.success("Rejected", { duration: 1500 });
        setRejectReason("");
        onActionComplete?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  };
  const onReject = () => {
    setShowReject(true);
  };

  const onSaveSummary = () => {
    if (draftSummary.trim() === entry.summary) {
      setEditingSummary(false);
      return;
    }
    startTransition(async () => {
      try {
        await editExtraction(entry.id, { summary: draftSummary });
        toast.success("Saved", { duration: 1500 });
        setEditingSummary(false);
        onActionComplete?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white">
      {/* Header band */}
      <div className="flex flex-col gap-2 border-b border-zinc-100 px-4 py-3">
        {/* Row 1 — type + case/claimant + status/overdue */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono uppercase tracking-wider text-zinc-600">
            {entry.entryType.replace(/_/g, " ")}
          </span>
          {entry.caseNumber ? (
            <span className="font-mono text-[12px] text-zinc-700">
              {entry.caseNumber}
            </span>
          ) : null}
          {entry.claimantName ? (
            <span className="text-[12px] text-zinc-600">
              · {entry.claimantName}
            </span>
          ) : null}
          {entry.isVerified || entry.isExcluded ? (
            <StatusBadge entry={entry} />
          ) : null}
          {entry.daysPending >= 7 && !entry.isVerified && !entry.isExcluded ? (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
              {entry.daysPending}d overdue
            </span>
          ) : null}
        </div>
        {/* Row 2 — confidence + actions */}
        <div className="flex items-center justify-between gap-3">
          <ConfidenceBadge value={entry.confidence} />
          <div className="flex shrink-0 items-center gap-1.5">
            <ActionButton
              label="Reject"
              shortcut="R"
              icon={<X size={14} aria-hidden="true" />}
              onClick={onReject}
              disabled={isPending || entry.isExcluded}
              tone="danger"
            />
            <ActionButton
              label="Edit"
              shortcut="E"
              icon={<Edit3 size={14} aria-hidden="true" />}
              onClick={() => setEditingSummary((v) => !v)}
              disabled={isPending}
              tone="neutral"
            />
            <ActionButton
              label="Approve"
              shortcut="A"
              icon={<Check size={14} aria-hidden="true" />}
              onClick={onApprove}
              disabled={isPending || entry.isVerified}
              tone="primary"
            />
          </div>
        </div>
      </div>

      {/* Inline reject reason form */}
      {showReject ? (
        <div className="border-b border-red-100 bg-red-50/50 px-4 py-3">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-red-800">
            Rejection reason (optional)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
              placeholder="e.g. wrong patient, hallucinated diagnosis…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitReject();
                if (e.key === "Escape") setShowReject(false);
              }}
              className="flex-1 rounded border border-red-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-red-400"
            />
            <button
              type="button"
              onClick={() => {
                setShowReject(false);
                setRejectReason("");
              }}
              className="rounded border border-zinc-200 bg-white px-2 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReject}
              disabled={isPending}
              className="rounded bg-red-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <Section label="Summary" first>
          {editingSummary ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                rows={4}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-[14px] outline-none focus:border-zinc-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftSummary(entry.summary);
                    setEditingSummary(false);
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSaveSummary}
                  disabled={isPending}
                  className="rounded bg-zinc-900 px-2 py-1 text-[12px] text-white disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[15px] font-medium leading-[1.55] text-zinc-900">
              {entry.summary || (
                <span className="italic font-normal text-zinc-400">
                  No summary
                </span>
              )}
            </p>
          )}
        </Section>

        <Section label="Facts">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[13px] sm:grid-cols-3">
            <FactCol label="Provider" value={entry.providerName} accent />
            <FactCol label="Facility" value={entry.facilityName} />
            <FactCol
              label="Event date"
              value={
                entry.eventDate
                  ? new Date(entry.eventDate).toLocaleDateString()
                  : null
              }
            />
          </dl>
        </Section>

        <SeverityList label="Diagnoses" items={entry.diagnoses} />
        <SeverityList label="Treatments" items={entry.treatments} variant="treatment" />
        <SeverityList label="Medications" items={entry.medications} variant="medication" />

        {entry.details ? (
          <Section label="Raw extraction">
            <details className="group rounded border border-zinc-100 bg-zinc-50/50 open:bg-zinc-50">
              <summary className="cursor-pointer list-none px-3 py-1.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-700">
                <span className="select-none">
                  {entry.details.split("\n").filter(Boolean).length} extracted
                  fields ·{" "}
                  <span className="text-zinc-400 group-open:hidden">show</span>
                  <span className="hidden text-zinc-400 group-open:inline">
                    hide
                  </span>
                </span>
              </summary>
              <pre className="whitespace-pre-wrap break-words border-t border-zinc-100 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-600">
                {entry.details}
              </pre>
            </details>
          </Section>
        ) : null}

        {entry.sourceHighlights.length > 0 ? (
          <Section label={`Source highlights · ${entry.sourceHighlights.length}`}>
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded border border-zinc-100 bg-white">
              {entry.sourceHighlights.slice(0, 8).map((h, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3 px-3 py-1.5 text-[12px] hover:bg-zinc-50/60"
                >
                  <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    {h.field}
                  </span>
                  <span className="flex-1 truncate italic text-zinc-700">
                    “{h.text}”
                  </span>
                  {h.startChar != null ? (
                    <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                      {h.startChar}–{h.endChar}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

// ─── Source pane (PDF) ────────────────────────────────────────────

function SourcePane({ entry }: { entry: AiReviewEntry }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!entry.sourceDocumentId) {
      setSignedUrl(null);
      setError("This entry has no source PDF linked.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    getDocumentUrl(entry.sourceDocumentId)
      .then((res) => {
        if (cancelled) return;
        if ("error" in res && res.error) {
          setError(res.error);
        } else if ("url" in res && res.url) {
          setSignedUrl(res.url);
        } else {
          setError("Source PDF unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Source PDF unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.sourceDocumentId, retryToken]);

  if (loading) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500"
        role="status"
        aria-label="Loading source PDF"
      >
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-[12px]">Loading source PDF…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center"
      >
        <div className="text-zinc-400">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
        </div>
        <div className="text-[14px] font-medium text-zinc-900">
          Source PDF unavailable
        </div>
        <div className="max-w-sm text-[12px] text-zinc-500">
          {error.startsWith("This entry") || error.startsWith("This document")
            ? error
            : "We couldn't load the source for this entry. The reviewer can still approve or reject based on the extracted fields."}
        </div>
        {entry.sourceDocumentId ? (
          <button
            type="button"
            onClick={() => setRetryToken((t) => t + 1)}
            className="mt-1 rounded border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (!signedUrl) return null;

  // Try to derive a 1-based page from the entry metadata's pageReference.
  const pageRef = entry.metadata.pageReference as string | undefined;
  const initialPage = pageRef ? Number.parseInt(pageRef, 10) : undefined;

  return (
    <div className="h-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <DocumentPreview
        fileName={entry.sourceDocumentName ?? "source.pdf"}
        fileType="application/pdf"
        signedUrl={signedUrl}
        initialPage={
          Number.isFinite(initialPage) && (initialPage as number) > 0
            ? initialPage
            : undefined
        }
        onClose={() => {
          /* no-op — drawer/page own the close affordance */
        }}
      />
    </div>
  );
}

// ─── Small primitives ─────────────────────────────────────────────

function Section({
  label,
  children,
  first,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 ${first ? "" : "border-t border-zinc-100"}`}
    >
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function FactCol({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null | undefined;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate ${
          accent ? "text-[#263c94] font-medium" : "text-zinc-900"
        }`}
      >
        {value || <span className="italic text-zinc-400">—</span>}
      </dd>
    </div>
  );
}

/**
 * Heuristic severity assignment for diagnoses (not perfect but visually
 * useful — chronic/major terms get warmer tones, generic mental-health
 * terms get neutral). When variant != "diagnosis" we render flat.
 */
function severityFor(text: string): "severe" | "major" | "minor" {
  const t = text.toLowerCase();
  if (
    /amputee|amputation|cancer|metastat|terminal|stage iv|paralysis|stroke|heart failure|kidney failure|cirrhosis|copd|als/.test(
      t,
    )
  ) {
    return "severe";
  }
  if (
    /major depress|bipolar|schizo|ptsd|chronic|severe|fracture|hernia|herniated|seizure|psychosis|fibromyalgia/.test(
      t,
    )
  ) {
    return "major";
  }
  return "minor";
}

function SeverityList({
  label,
  items,
  variant = "diagnosis",
}: {
  label: string;
  items: string[];
  variant?: "diagnosis" | "treatment" | "medication";
}) {
  if (!items.length) return null;
  return (
    <Section label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => {
          const tones: Record<"severe" | "major" | "minor", string> = {
            severe: "border-red-200 bg-red-50 text-red-900",
            major: "border-amber-200 bg-amber-50 text-amber-900",
            minor: "border-zinc-200 bg-white text-zinc-700",
          };
          const tone =
            variant === "diagnosis" ? severityFor(it) : ("minor" as const);
          return (
            <span
              key={`${label}-${i}`}
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[12px] ${tones[tone]}`}
            >
              {it}
            </span>
          );
        })}
      </div>
    </Section>
  );
}

function ActionButton({
  label,
  shortcut,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "primary" | "neutral" | "danger";
}) {
  const tones: Record<typeof tone, string> = {
    primary:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400",
    neutral:
      "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:ring-zinc-400",
    danger:
      "border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-400",
  };
  const kbdTones: Record<typeof tone, string> = {
    primary: "bg-emerald-800/60 text-emerald-50",
    neutral: "bg-zinc-100 text-zinc-600",
    danger: "bg-red-100 text-red-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      title={`${label} — ${shortcut}`}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ${tones[tone]}`}
    >
      {icon}
      <span>{label}</span>
      <kbd
        className={`ml-1 rounded px-1 text-[10px] font-mono leading-none ${kbdTones[tone]}`}
        aria-hidden
      >
        {shortcut}
      </kbd>
    </button>
  );
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500">
        no conf
      </span>
    );
  }
  const tone =
    value >= 81
      ? "bg-emerald-50 text-emerald-700"
      : value >= 60
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  return <span className={`rounded px-1.5 py-0.5 ${tone}`}>{value}%</span>;
}

function StatusBadge({ entry }: { entry: AiReviewEntry }) {
  if (entry.isVerified)
    return (
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
        approved
      </span>
    );
  if (entry.isExcluded)
    return (
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
        rejected
      </span>
    );
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
      pending
    </span>
  );
}
