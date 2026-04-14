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
import type { AppealsCouncilSubnavData } from "@/lib/dashboard-subnav/types";
import {
  generateAppealsCouncilDraft,
  approveAndFileAppealsBrief,
  recordAppealsOutcome,
  getUnfavorableCandidateCases,
  getReviewableAppealsDrafts,
  getOpenAppealsBriefs,
  type UnfavorableCandidate,
  type ReviewableAppealsDraft,
  type OpenAppealsBrief,
  type AppealsOutcome,
} from "@/app/actions/appeals-council";

export function AppealsCouncilSubnav({
  data,
}: {
  data: AppealsCouncilSubnavData;
}) {
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  return (
    <SubnavShell title="The Chamber">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Open urgent brief", href: "/appeals-council" },
          {
            label: "AI draft from latest",
            onClick: () => setAiDraftOpen(true),
          },
          {
            label: "Approve & file",
            onClick: () => setApproveOpen(true),
          },
          {
            label: "Mark outcome",
            onClick: () => setOutcomeOpen(true),
          },
        ]}
      />

      <SubnavSectionLabel>Deadlines</SubnavSectionLabel>
      <SubnavStatRow
        label="Briefs due in 7d"
        value={data.briefsDueIn7d}
        tone={data.briefsDueIn7d > 0 ? "warn" : "ok"}
        href="/appeals-council"
      />
      <SubnavStatRow
        label="Grants this month"
        value={data.grantsThisMonth}
        tone="ok"
      />

      {/* Anchor: ALJ Remand Tracker — the compounding knowledge */}
      <SubnavSectionLabel>ALJ Remand Tracker</SubnavSectionLabel>
      <SubnavAnchorBlock label="Where the law tilts in your favor">
        {data.aljRemandTracker.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            Not enough decided briefs yet to compute remand patterns.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.aljRemandTracker.map((a) => {
              const tone =
                a.remandedRate >= 30
                  ? COLORS.emeraldDeep
                  : a.remandedRate >= 10
                    ? COLORS.warn
                    : COLORS.text3;
              return (
                <li
                  key={a.alj}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: COLORS.text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    {a.alj}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: COLORS.text3,
                      fontSize: 10,
                    }}
                  >
                    n={a.totalDecisions}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: tone,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {a.remandedRate}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <AiDraftDialog open={aiDraftOpen} onOpenChange={setAiDraftOpen} />
      <ApproveAndFileDialog open={approveOpen} onOpenChange={setApproveOpen} />
      <MarkOutcomeDialog open={outcomeOpen} onOpenChange={setOutcomeOpen} />
    </SubnavShell>
  );
}

// ─────────────────────────────────────────────────────────────
// AI draft from latest
// ─────────────────────────────────────────────────────────────

function AiDraftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<UnfavorableCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUnfavorableCandidateCases()
      .then((rows) => {
        setCandidates(rows);
        if (rows.length > 0) setSelectedCase(rows[0].caseId);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) {
      toast.error("Pick a case first.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateAppealsCouncilDraft(selectedCase);
        if (!result.success) {
          toast.error(result.message ?? "Could not generate draft");
          return;
        }
        const draftId = result.data?.draftId;
        toast.success("AC brief draft created", {
          action: draftId
            ? {
                label: "Open draft",
                onClick: () => router.push(`/drafts/${draftId}`),
              }
            : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not generate draft");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Appeals Council Draft</DialogTitle>
          <DialogDescription>
            Pick a recent unfavorable ALJ decision. We&apos;ll create an
            Appeals Council brief draft in your review queue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ac-draft-case">Case</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading recent unfavorable decisions…
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No recent unfavorable decisions on file.{" "}
                <Link
                  href="/post-hearing"
                  className="underline"
                  style={{ color: COLORS.brand }}
                >
                  Review post-hearing queue →
                </Link>
              </div>
            ) : (
              <Select value={selectedCase} onValueChange={setSelectedCase}>
                <SelectTrigger id="ac-draft-case">
                  <SelectValue placeholder="Pick a case…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.caseId} value={c.caseId}>
                      {c.caseNumber} — {c.claimantName}
                      {c.daysSinceDecision !== null
                        ? ` · ${c.daysSinceDecision}d ago`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
              {isPending ? "Generating…" : "Generate draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Approve & file
// ─────────────────────────────────────────────────────────────

function ApproveAndFileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<ReviewableAppealsDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getReviewableAppealsDrafts()
      .then((rows) => {
        setDrafts(rows);
        if (rows.length > 0) setSelectedDraft(rows[0].draftId);
      })
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = drafts.find((d) => d.draftId === selectedDraft) ?? null;
  const targetDate = new Date(Date.now() + 1 * 86_400_000);
  const targetLabel = targetDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDraft) {
      toast.error("Pick a draft to file.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await approveAndFileAppealsBrief(selectedDraft);
        if (!result.success) {
          toast.error(result.message ?? "Could not file brief");
          return;
        }
        const caseId = result.data?.caseId;
        toast.success("Brief approved and queued for filing", {
          action: caseId
            ? {
                label: "Open case",
                onClick: () => router.push(`/cases/${caseId}`),
              }
            : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not file brief");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {selected
              ? `File AC brief for ${selected.caseNumber ?? "this case"}?`
              : "Approve & file AC brief"}
          </DialogTitle>
          <DialogDescription>
            Confirm the draft, ALJ office, and target filing date. The brief
            moves to the filing queue on confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ac-file-draft">Draft</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading reviewable drafts…
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No appeals-council drafts awaiting approval.
              </div>
            ) : (
              <Select value={selectedDraft} onValueChange={setSelectedDraft}>
                <SelectTrigger id="ac-file-draft">
                  <SelectValue placeholder="Pick a draft…" />
                </SelectTrigger>
                <SelectContent>
                  {drafts.map((d) => (
                    <SelectItem key={d.draftId} value={d.draftId}>
                      {d.title}
                      {d.caseNumber ? ` — ${d.caseNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${COLORS.borderDefault}`,
              }}
            >
              <div style={{ color: COLORS.text3, marginBottom: 2 }}>
                ALJ Office
              </div>
              <div style={{ color: COLORS.text1 }}>
                SSA Appeals Council (Falls Church, VA)
              </div>
            </div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${COLORS.borderDefault}`,
              }}
            >
              <div style={{ color: COLORS.text3, marginBottom: 2 }}>
                Target filing
              </div>
              <div style={{ color: COLORS.text1 }}>{targetLabel}</div>
            </div>
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
              disabled={isPending || loading || drafts.length === 0}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Filing…" : "Confirm & file"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark outcome
// ─────────────────────────────────────────────────────────────

const APPEALS_OUTCOMES: Array<{
  value: AppealsOutcome;
  label: string;
  helper: string;
}> = [
  { value: "granted", label: "Granted", helper: "Council granted review." },
  { value: "denied", label: "Denied", helper: "Review denied; ALJ stands." },
  { value: "remanded", label: "Remanded", helper: "Sent back to ALJ for rehearing." },
  { value: "dismissed", label: "Dismissed", helper: "Appeal dismissed on procedure." },
];

function MarkOutcomeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [briefs, setBriefs] = useState<OpenAppealsBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [outcome, setOutcome] = useState<AppealsOutcome>("denied");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotes("");
    setOutcome("denied");
    getOpenAppealsBriefs()
      .then((rows) => {
        setBriefs(rows);
        if (rows.length > 0) setSelectedCase(rows[0].caseId);
      })
      .catch(() => setBriefs([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) {
      toast.error("Pick a case.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await recordAppealsOutcome(
          selectedCase,
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
          <DialogTitle>Record Appeals Council outcome</DialogTitle>
          <DialogDescription>
            Pick the brief, select the Council&apos;s decision, and add
            optional notes for the file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ac-outcome-case">Case</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading open briefs…
              </div>
            ) : briefs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No open Appeals Council briefs on file.
              </div>
            ) : (
              <Select value={selectedCase} onValueChange={setSelectedCase}>
                <SelectTrigger id="ac-outcome-case">
                  <SelectValue placeholder="Pick a case…" />
                </SelectTrigger>
                <SelectContent>
                  {briefs.map((b) => (
                    <SelectItem key={b.briefId} value={b.caseId}>
                      {b.caseNumber} — {b.claimantName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ac-outcome-value">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as AppealsOutcome)}
            >
              <SelectTrigger id="ac-outcome-value">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPEALS_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {APPEALS_OUTCOMES.find((o) => o.value === outcome)?.helper}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ac-outcome-notes">Notes (optional)</Label>
            <Textarea
              id="ac-outcome-notes"
              rows={3}
              placeholder="Key reasoning, dissent highlights, next steps…"
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
              disabled={isPending || loading || briefs.length === 0}
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
