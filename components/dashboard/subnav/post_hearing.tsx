"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
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
import { COLORS } from "@/lib/design-tokens";
import type { PostHearingSubnavData } from "@/lib/dashboard-subnav/types";
import {
  approveClientNotification,
  getOverrideCandidates,
  getPendingCompletionOutcome,
  getPendingNotificationOutcome,
  getUnrecordedOutcomes,
  markOutcomeComplete,
  overrideOutcome,
  setHearingOutcome,
  type HearingOutcomeValue,
  type OverrideCandidate,
  type PendingCompletionOutcome,
  type PendingNotificationOutcome,
  type UnrecordedOutcome,
} from "@/app/actions/post-hearing";

export function PostHearingSubnav({
  data,
}: {
  data: PostHearingSubnavData;
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [markOutcomeOpen, setMarkOutcomeOpen] = useState(false);

  return (
    <SubnavShell title="Pipeline Conductor">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Approve notification",
            onClick: () => setApproveOpen(true),
          },
          {
            label: "Override AI",
            onClick: () => setOverrideOpen(true),
          },
          {
            label: "Mark outcome",
            onClick: () => setMarkOutcomeOpen(true),
          },
          {
            label: "Mark complete",
            onClick: () => setCompleteOpen(true),
          },
        ]}
      />

      {/* Anchor: Anomaly Inbox — what makes the role defensible */}
      <SubnavSectionLabel>Anomaly Inbox</SubnavSectionLabel>
      <SubnavAnchorBlock label={`${data.anomalies.length} need a human eye`}>
        {data.anomalies.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.emeraldDeep }}>
            All clear. The pipeline is in tune.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {data.anomalies.slice(0, 4).map((a) => (
              <li
                key={a.id}
                style={{
                  display: "grid",
                  gap: 2,
                }}
              >
                {a.href ? (
                  <Link
                    href={a.href}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.text1,
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </Link>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </span>
                )}
                <span style={{ fontSize: 10, color: COLORS.warn }}>
                  ⚠ {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pipeline</SubnavSectionLabel>
      <SubnavStatRow
        label="Awaiting notification"
        value={data.awaitingNotification}
        tone={data.awaitingNotification > 0 ? "warn" : "ok"}
        href="/post-hearing"
      />
      <SubnavStatRow
        label="Blocked transitions"
        value={data.blockedTransitions}
        tone={data.blockedTransitions > 0 ? "bad" : "ok"}
      />

      <SubnavSectionLabel>Recent Notifications</SubnavSectionLabel>
      <SubnavRecentList items={data.recentInterventions} />

      <ApproveNotificationDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
      />
      <OverrideAiDialog open={overrideOpen} onOpenChange={setOverrideOpen} />
      <MarkCompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
      />
      <MarkOutcomeDialog
        open={markOutcomeOpen}
        onOpenChange={setMarkOutcomeOpen}
      />
    </SubnavShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Approve notification
// ─────────────────────────────────────────────────────────────

function ApproveNotificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState<PendingNotificationOutcome | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPendingNotificationOutcome()
      .then(setCandidate)
      .catch(() => setCandidate(null))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate) return;
    startTransition(async () => {
      try {
        const result = await approveClientNotification(candidate.outcomeId);
        if (!result.success) {
          toast.error(result.message ?? "Could not approve notification");
          return;
        }
        toast.success("Client notification approved");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not approve notification",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {candidate
              ? `Approve client notification for case ${candidate.caseNumber}?`
              : "Approve client notification"}
          </DialogTitle>
          <DialogDescription>
            This stamps the client-notification step so the case can advance
            through the post-hearing pipeline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">
              Loading oldest unnotified outcome…
            </div>
          ) : !candidate ? (
            <div className="text-sm text-muted-foreground">
              No outcomes awaiting client notification. All clear.
            </div>
          ) : (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.borderDefault}`,
                display: "grid",
                gap: 4,
              }}
            >
              <div className="text-xs" style={{ color: COLORS.text3 }}>
                Case
              </div>
              <div style={{ color: COLORS.text1, fontWeight: 600 }}>
                {candidate.caseNumber} — {candidate.claimantName}
              </div>
              <div className="text-xs" style={{ color: COLORS.text3 }}>
                Outcome:{" "}
                <span style={{ color: COLORS.text1 }}>
                  {candidate.outcome ?? "—"}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || loading || !candidate}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Approving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Override AI
// ─────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS: Array<{
  value: HearingOutcomeValue;
  label: string;
  helper: string;
}> = [
  { value: "favorable", label: "Favorable", helper: "ALJ decision fully favorable." },
  {
    value: "partially_favorable",
    label: "Partially favorable",
    helper: "Favorable on some issues only.",
  },
  { value: "unfavorable", label: "Unfavorable", helper: "ALJ denied the claim." },
  { value: "dismissed", label: "Dismissed", helper: "Claim dismissed on procedure." },
  { value: "postponed", label: "Postponed", helper: "Hearing postponed to a later date." },
];

function OverrideAiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<OverrideCandidate[]>([]);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>("");
  const [newOutcome, setNewOutcome] =
    useState<HearingOutcomeValue>("unfavorable");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setReason("");
    getOverrideCandidates()
      .then((rows) => {
        setCandidates(rows);
        if (rows.length > 0) {
          setSelectedOutcomeId(rows[0].outcomeId);
          const current = rows[0].outcome as HearingOutcomeValue;
          setNewOutcome(
            current === "unfavorable" ? "favorable" : "unfavorable",
          );
        }
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [open]);

  const trimmedReason = reason.trim();
  const selected = candidates.find((c) => c.outcomeId === selectedOutcomeId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOutcomeId) {
      toast.error("Pick an outcome to override.");
      return;
    }
    if (trimmedReason.length === 0) {
      toast.error("A reason is required to override.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await overrideOutcome(
          selectedOutcomeId,
          newOutcome,
          trimmedReason,
        );
        if (!result.success) {
          toast.error(result.message ?? "Could not override outcome");
          return;
        }
        toast.success(`Outcome overridden to ${newOutcome}`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not override outcome",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Override AI-classified outcome</DialogTitle>
          <DialogDescription>
            Pick an outcome the scraper or AI flagged, choose the correct
            value, and explain why. The original value is captured in the
            audit log.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ph-override-case">Case</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading AI-classified outcomes…
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No outcomes awaiting human sign-off.
              </div>
            ) : (
              <Select
                value={selectedOutcomeId}
                onValueChange={setSelectedOutcomeId}
              >
                <SelectTrigger id="ph-override-case">
                  <SelectValue placeholder="Pick an outcome…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.outcomeId} value={c.outcomeId}>
                      {c.caseNumber} — {c.claimantName} · {c.outcome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selected ? (
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                Current classification:{" "}
                <span style={{ color: COLORS.text1 }}>{selected.outcome}</span>
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph-override-outcome">New outcome</Label>
            <Select
              value={newOutcome}
              onValueChange={(v) => setNewOutcome(v as HearingOutcomeValue)}
            >
              <SelectTrigger id="ph-override-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {OUTCOME_OPTIONS.find((o) => o.value === newOutcome)?.helper}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph-override-reason">
              Reason <span style={{ color: COLORS.bad }}>*</span>
            </Label>
            <Textarea
              id="ph-override-reason"
              rows={3}
              placeholder="Why is the AI classification wrong? (required for audit)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                loading ||
                candidates.length === 0 ||
                trimmedReason.length === 0
              }
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Overriding…" : "Confirm override"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark complete
// ─────────────────────────────────────────────────────────────

function MarkCompleteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState<PendingCompletionOutcome | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPendingCompletionOutcome()
      .then(setCandidate)
      .catch(() => setCandidate(null))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate) return;
    startTransition(async () => {
      try {
        const result = await markOutcomeComplete(candidate.outcomeId);
        if (!result.success) {
          toast.error(result.message ?? "Could not mark complete");
          return;
        }
        toast.success("Processing marked complete");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not mark complete",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {candidate
              ? `Mark case ${candidate.caseNumber} processing complete?`
              : "Mark post-hearing processing complete"}
          </DialogTitle>
          <DialogDescription>
            Stamps the processing-completed timestamp for the oldest
            client-notified outcome. Use only after every follow-up has been
            filed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">
              Loading oldest notified outcome…
            </div>
          ) : !candidate ? (
            <div className="text-sm text-muted-foreground">
              No notified outcomes are waiting to be marked complete.
            </div>
          ) : (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.borderDefault}`,
                display: "grid",
                gap: 4,
              }}
            >
              <div className="text-xs" style={{ color: COLORS.text3 }}>
                Case
              </div>
              <div style={{ color: COLORS.text1, fontWeight: 600 }}>
                {candidate.caseNumber} — {candidate.claimantName}
              </div>
              <div className="text-xs" style={{ color: COLORS.text3 }}>
                Outcome:{" "}
                <span style={{ color: COLORS.text1 }}>
                  {candidate.outcome ?? "—"}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || loading || !candidate}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Marking…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark outcome (record outcome for a past hearing)
// ─────────────────────────────────────────────────────────────

function MarkOutcomeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<UnrecordedOutcome[]>([]);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>("");
  const [outcome, setOutcome] = useState<HearingOutcomeValue>("favorable");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotes("");
    setOutcome("favorable");
    getUnrecordedOutcomes()
      .then((rows) => {
        setCandidates(rows);
        if (rows.length > 0) setSelectedOutcomeId(rows[0].outcomeId);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOutcomeId) {
      toast.error("Pick a hearing.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await setHearingOutcome(
          selectedOutcomeId,
          outcome,
          notes.trim() || undefined,
        );
        if (!result.success) {
          toast.error(result.message ?? "Could not record outcome");
          return;
        }
        toast.success(`Outcome recorded: ${outcome}`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not record outcome",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record hearing outcome</DialogTitle>
          <DialogDescription>
            Choose a hearing that has already occurred, select the ALJ&apos;s
            decision, and add optional notes for the file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ph-mark-case">Hearing</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading hearings without a recorded outcome…
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No past hearings need an outcome recorded.
              </div>
            ) : (
              <Select
                value={selectedOutcomeId}
                onValueChange={setSelectedOutcomeId}
              >
                <SelectTrigger id="ph-mark-case">
                  <SelectValue placeholder="Pick a hearing…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.outcomeId} value={c.outcomeId}>
                      {c.caseNumber} — {c.claimantName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph-mark-outcome">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as HearingOutcomeValue)}
            >
              <SelectTrigger id="ph-mark-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {OUTCOME_OPTIONS.find((o) => o.value === outcome)?.helper}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph-mark-notes">Notes (optional)</Label>
            <Textarea
              id="ph-mark-notes"
              rows={3}
              placeholder="Key reasoning, dissent highlights, follow-up items…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || loading || candidates.length === 0}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Saving…" : "Record outcome"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
