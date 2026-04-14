"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  CourtHouseIcon,
} from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/design-tokens";
import {
  approveHearingOutcome,
  markOutcomeComplete,
  overrideAiOutcome,
  logHearingOutcome,
  type HearingOutcomeValue,
  type PendingOutcomeRow,
} from "@/app/actions/post-hearing";

type CaseSummary = {
  id: string;
  caseNumber: string;
  claimantName: string;
};

export type PostHearingSubnavProps = {
  pendingOutcome: PendingOutcomeRow | null;
  inFlightOutcome: PendingOutcomeRow | null;
  aiAnomalies: PendingOutcomeRow[];
  markableCases?: CaseSummary[];
};

const OUTCOME_OPTIONS: { value: HearingOutcomeValue; label: string }[] = [
  { value: "fully_favorable", label: "Fully Favorable" },
  { value: "partially_favorable", label: "Partially Favorable" },
  { value: "unfavorable", label: "Unfavorable" },
  { value: "dismissed", label: "Dismissed" },
  { value: "remanded", label: "Remanded" },
];

function formatOutcome(value: string): string {
  const found = OUTCOME_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value.replace(/_/g, " ");
}

function formatHearingDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export function PostHearingSubnav({
  pendingOutcome,
  inFlightOutcome,
  aiAnomalies,
  markableCases = [],
}: PostHearingSubnavProps) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="px-2 text-[10px] font-semibold uppercase tracking-[0.05em]"
        style={{ color: COLORS.text3 }}
      >
        Post-Hearing Actions
      </div>

      <div className="grid grid-cols-2 gap-2 px-2">
        {/* 24-29 */}
        <ApproveNotificationButton outcome={pendingOutcome} />
        {/* 30-35 */}
        <OverrideAiButton anomalies={aiAnomalies} />
        {/* 37-42 */}
        <MarkCompleteButton outcome={inFlightOutcome} />
        {/* Mark outcome */}
        <MarkOutcomeButton cases={markableCases} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Approve notification
// ---------------------------------------------------------------------------

function ApproveNotificationButton({
  outcome,
}: {
  outcome: PendingOutcomeRow | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = !outcome;

  function handleConfirm() {
    if (!outcome) return;
    startTransition(async () => {
      try {
        const res = await approveHearingOutcome(outcome.id);
        toast.success(
          res.transitionedToStageId
            ? "Approved — case advanced to next stage."
            : "Approved for processing.",
        );
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to approve hearing outcome.";
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="justify-start h-auto py-2"
      >
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={14}
          color={COLORS.ok}
        />
        <span className="ml-1 text-left">
          <span className="block text-[12px] font-medium">Approve</span>
          <span className="block text-[10px]" style={{ color: COLORS.text3 }}>
            {outcome ? `#${outcome.caseNumber}` : "No pending notifications"}
          </span>
        </span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Hearing Outcome</DialogTitle>
          <DialogDescription>
            Mark the oldest pending notification as approved for processing.
          </DialogDescription>
        </DialogHeader>

        {outcome ? (
          <div className="space-y-3 py-2 text-[13px]">
            <Row label="Case" value={`#${outcome.caseNumber}`} />
            <Row label="Claimant" value={outcome.claimantName || "—"} />
            <Row label="Outcome" value={formatOutcome(outcome.outcome)} />
            <Row
              label="Hearing Date"
              value={formatHearingDate(outcome.hearingDate)}
            />
            {outcome.notes && (
              <div>
                <div
                  className="text-[11px] font-medium uppercase tracking-[0.05em]"
                  style={{ color: COLORS.text3 }}
                >
                  Notes
                </div>
                <p className="mt-1" style={{ color: COLORS.text2 }}>
                  {outcome.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: COLORS.text2 }}>
            No pending outcome notifications to approve right now.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={disabled || isPending}
            style={{ backgroundColor: COLORS.brand }}
          >
            {isPending ? "Approving..." : "Approve for Processing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 2. Override AI
// ---------------------------------------------------------------------------

function OverrideAiButton({ anomalies }: { anomalies: PendingOutcomeRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOutcome, setNewOutcome] = useState<HearingOutcomeValue | "">("");
  const [reason, setReason] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const disabled = anomalies.length === 0;

  const selected = useMemo(
    () => anomalies.find((a) => a.id === selectedId) ?? null,
    [anomalies, selectedId],
  );

  function resetForm() {
    setSelectedId(null);
    setNewOutcome("");
    setReason("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !newOutcome) {
      toast.error("Pick an anomaly and a new outcome.");
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      toast.error("A reason is required for the audit trail.");
      return;
    }
    startTransition(async () => {
      try {
        await overrideAiOutcome(selected.id, newOutcome, trimmed);
        toast.success("AI outcome overridden and logged.");
        resetForm();
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to override outcome.";
        toast.error(message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="justify-start h-auto py-2"
      >
        <HugeiconsIcon
          icon={AlertCircleIcon}
          size={14}
          color={disabled ? COLORS.text3 : COLORS.warn}
        />
        <span className="ml-1 text-left">
          <span className="block text-[12px] font-medium">Override AI</span>
          <span className="block text-[10px]" style={{ color: COLORS.text3 }}>
            {anomalies.length > 0
              ? `${anomalies.length} anomaly${
                  anomalies.length === 1 ? "" : " items"
                }`
              : "No anomalies"}
          </span>
        </span>
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Override AI Hearing Outcome</DialogTitle>
          <DialogDescription>
            Pick an anomaly flagged by the AI (confidence &lt; 60) and correct
            the outcome. A reason is required and will be written to the audit
            log.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Anomaly</Label>
            <Select
              value={selectedId ?? ""}
              onValueChange={(v) => setSelectedId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick an anomaly to review..." />
              </SelectTrigger>
              <SelectContent>
                {anomalies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    #{a.caseNumber}
                    {a.claimantName ? ` · ${a.claimantName}` : ""} —{" "}
                    {formatOutcome(a.outcome)}
                    {a.aiConfidence != null ? ` (${a.aiConfidence}%)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div
              className="rounded-[6px] border px-3 py-2 space-y-1 text-[12px]"
              style={{
                borderColor: COLORS.borderDefault,
                backgroundColor: COLORS.warnSubtle,
              }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.text2 }}>AI Outcome</span>
                <Badge variant="outline">{formatOutcome(selected.outcome)}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.text2 }}>AI Confidence</span>
                <span className="font-medium" style={{ color: COLORS.text1 }}>
                  {selected.aiConfidence != null
                    ? `${selected.aiConfidence}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.text2 }}>Hearing Date</span>
                <span style={{ color: COLORS.text1 }}>
                  {formatHearingDate(selected.hearingDate)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="override-outcome">New Outcome</Label>
            <Select
              value={newOutcome}
              onValueChange={(v) => setNewOutcome(v as HearingOutcomeValue)}
            >
              <SelectTrigger id="override-outcome">
                <SelectValue placeholder="Pick the correct outcome..." />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason (required)</Label>
            <Textarea
              id="override-reason"
              rows={3}
              placeholder="e.g. ALJ decision letter arrived today, confirms fully favorable, AI classified as partial due to phrasing."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !selected || !newOutcome || reason.trim().length === 0 || isPending
              }
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Saving..." : "Override Outcome"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 3. Mark complete
// ---------------------------------------------------------------------------

function MarkCompleteButton({
  outcome,
}: {
  outcome: PendingOutcomeRow | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = !outcome;

  function handleConfirm() {
    if (!outcome) return;
    startTransition(async () => {
      try {
        await markOutcomeComplete(outcome.id);
        toast.success("Outcome marked complete.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to mark outcome complete.";
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="justify-start h-auto py-2"
      >
        <HugeiconsIcon icon={Alert01Icon} size={14} color={COLORS.ok} />
        <span className="ml-1 text-left">
          <span className="block text-[12px] font-medium">Mark Complete</span>
          <span className="block text-[10px]" style={{ color: COLORS.text3 }}>
            {outcome ? `#${outcome.caseNumber}` : "Nothing in flight"}
          </span>
        </span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Outcome Complete</DialogTitle>
          <DialogDescription>
            Mark the oldest in-flight outcome as processing-complete. This
            closes out all post-hearing work for the case.
          </DialogDescription>
        </DialogHeader>

        {outcome ? (
          <div className="space-y-3 py-2 text-[13px]">
            <Row label="Case" value={`#${outcome.caseNumber}`} />
            <Row label="Claimant" value={outcome.claimantName || "—"} />
            <Row label="Outcome" value={formatOutcome(outcome.outcome)} />
            <Row
              label="Hearing Date"
              value={formatHearingDate(outcome.hearingDate)}
            />
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: COLORS.text2 }}>
            No in-flight outcomes to close out right now.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={disabled || isPending}
            style={{ backgroundColor: COLORS.brand }}
          >
            {isPending ? "Closing..." : "Mark Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 4. Mark outcome (picker)
// ---------------------------------------------------------------------------

function MarkOutcomeButton({ cases }: { cases: CaseSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [caseId, setCaseId] = useState<string>("");
  const [outcome, setOutcome] = useState<HearingOutcomeValue | "">("");
  const [notes, setNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const disabled = cases.length === 0;

  function resetForm() {
    setCaseId("");
    setOutcome("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId || !outcome) {
      toast.error("Pick a case and an outcome.");
      return;
    }
    startTransition(async () => {
      try {
        await logHearingOutcome(caseId, outcome, notes.trim() || undefined);
        toast.success("Outcome logged and queued for review.");
        resetForm();
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to log hearing outcome.";
        toast.error(message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="justify-start h-auto py-2"
      >
        <HugeiconsIcon icon={CourtHouseIcon} size={14} color={COLORS.brand} />
        <span className="ml-1 text-left">
          <span className="block text-[12px] font-medium">Mark Outcome</span>
          <span className="block text-[10px]" style={{ color: COLORS.text3 }}>
            {cases.length > 0 ? "Log a decision" : "No eligible cases"}
          </span>
        </span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Hearing Outcome</DialogTitle>
          <DialogDescription>
            Record the ALJ decision for a case. The outcome will queue for
            reviewer approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="mark-outcome-case">Case</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger id="mark-outcome-case">
                <SelectValue placeholder="Pick a case..." />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    #{c.caseNumber}
                    {c.claimantName ? ` · ${c.claimantName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mark-outcome-value">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as HearingOutcomeValue)}
            >
              <SelectTrigger id="mark-outcome-value">
                <SelectValue placeholder="Pick an outcome..." />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mark-outcome-notes">Notes (optional)</Label>
            <Textarea
              id="mark-outcome-notes"
              rows={3}
              placeholder="Anything worth flagging for the reviewer."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!caseId || !outcome || isPending}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Logging..." : "Log Outcome"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Shared layout helper
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span
        className="text-[11px] font-medium uppercase tracking-[0.05em]"
        style={{ color: COLORS.text3 }}
      >
        {label}
      </span>
      <span style={{ color: COLORS.text1 }}>{value}</span>
    </div>
  );
}
