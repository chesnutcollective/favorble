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

  const onReject = () => {
    const reason = window.prompt("Reason for rejection (optional)");
    if (reason === null) return; // cancelled
    startTransition(async () => {
      try {
        await rejectExtraction(entry.id, reason || undefined);
        toast.success("Rejected", { duration: 1500 });
        onActionComplete?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
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
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5">
              {entry.entryType.replace(/_/g, " ")}
            </span>
            <ConfidenceBadge value={entry.confidence} />
            <StatusBadge entry={entry} />
            {entry.daysPending >= 7 && !entry.isVerified && !entry.isExcluded ? (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                {entry.daysPending}d pending
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[12px] text-zinc-600">
            {entry.caseNumber ? (
              <span className="font-mono">{entry.caseNumber}</span>
            ) : null}
            {entry.claimantName ? ` · ${entry.claimantName}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ActionButton
            label="Reject"
            shortcut="R"
            icon={<X size={14} />}
            onClick={onReject}
            disabled={isPending || entry.isExcluded}
            tone="danger"
          />
          <ActionButton
            label="Edit"
            shortcut="E"
            icon={<Edit3 size={14} />}
            onClick={() => setEditingSummary((v) => !v)}
            disabled={isPending}
            tone="neutral"
          />
          <ActionButton
            label="Approve"
            shortcut="A"
            icon={<Check size={14} />}
            onClick={onApprove}
            disabled={isPending || entry.isVerified}
            tone="primary"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Section label="Summary">
          {editingSummary ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                rows={4}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500"
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
                  {isPending ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-snug text-zinc-900">
              {entry.summary || (
                <span className="italic text-zinc-400">No summary</span>
              )}
            </p>
          )}
        </Section>

        <FieldRow label="Provider" value={entry.providerName} />
        <FieldRow label="Facility" value={entry.facilityName} />
        <FieldRow
          label="Event date"
          value={
            entry.eventDate
              ? new Date(entry.eventDate).toLocaleDateString()
              : null
          }
        />
        <ListBlock label="Diagnoses" items={entry.diagnoses} />
        <ListBlock label="Treatments" items={entry.treatments} />
        <ListBlock label="Medications" items={entry.medications} />

        {entry.details ? (
          <Section label="Details">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
              {entry.details}
            </p>
          </Section>
        ) : null}

        {entry.sourceHighlights.length > 0 ? (
          <Section label="Source highlights">
            <div className="flex flex-col gap-1.5">
              {entry.sourceHighlights.slice(0, 6).map((h, i) => (
                <div
                  key={i}
                  className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5"
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {h.field}
                  </div>
                  <div className="mt-0.5 text-[12px] italic text-zinc-700">
                    “{h.text}”
                  </div>
                  {h.startChar != null ? (
                    <div className="mt-0.5 text-[10px] font-mono text-zinc-400">
                      char {h.startChar}–{h.endChar}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
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

  useEffect(() => {
    if (!entry.sourceDocumentId) {
      setSignedUrl(null);
      setError("No source PDF linked to this entry.");
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
          setError("Could not load source PDF.");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.sourceDocumentId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 text-center text-[13px] text-amber-900">
        {error}
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="mt-2 flex items-baseline gap-3">
      <div className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="flex-1 truncate text-[13px] text-zinc-900">
        {value || <span className="italic text-zinc-400">—</span>}
      </div>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Section label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${label}-${i}`}
            className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[12px] text-zinc-700"
          >
            {it}
          </span>
        ))}
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
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    neutral: "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} — ${shortcut}`}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium transition disabled:opacity-50 ${tones[tone]}`}
    >
      {icon}
      <span>{label}</span>
      <kbd className="ml-1 rounded bg-black/10 px-1 text-[10px] font-mono">
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
