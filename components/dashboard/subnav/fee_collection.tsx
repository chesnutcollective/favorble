"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { markOldestApprovedFeeCollectedAction } from "@/app/actions/dashboard-quick-actions";
import {
  listDelinquentFeePetitions,
  previewFeeCollectionFollowUp,
  sendFeeCollectionFollowUp,
  type DelinquentFeePetition,
  type DunningTone,
} from "@/app/actions/fee-petitions";
import { COLORS } from "@/lib/design-tokens";
import type { FeeCollectionSubnavData } from "@/lib/dashboard-subnav/types";

export function FeeCollectionSubnav({
  data,
}: {
  data: FeeCollectionSubnavData;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SubnavShell title="Fees Desk">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <DialogTriggerButton
          label="Send follow-up"
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <SubnavActionGrid
        actions={[
          { label: "Generate petition", href: "/fee-collection?action=new" },
          {
            label: "Mark oldest collected",
            onAction: markOldestApprovedFeeCollectedAction,
          },
          { label: "Escalate dispute", href: "/fee-collection?tab=disputes" },
        ]}
      />

      <FeeCollectionFollowUpDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Anchor: 24-hour confirmed payments — the dopamine hit */}
      <SubnavSectionLabel>Last 24h Payments</SubnavSectionLabel>
      <SubnavAnchorBlock label={`${data.recentPayments.length} confirmed`}>
        {data.recentPayments.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No payments confirmed in the last 24 hours.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.recentPayments.slice(0, 5).map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    color: COLORS.emeraldDeep,
                    minWidth: 60,
                  }}
                >
                  +${p.amountDollars.toLocaleString()}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: COLORS.text1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: 10,
                  }}
                >
                  {p.caseNumber ?? "—"}
                </span>
                <span style={{ color: COLORS.text3, fontSize: 10 }}>
                  {p.relativeTime}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>At Risk</SubnavSectionLabel>
      <SubnavStatRow
        label="Dollars at risk"
        value={`$${data.totalAtRiskDollars.toLocaleString()}`}
        tone={data.totalAtRiskDollars > 0 ? "warn" : "ok"}
        href="/fee-collection?tab=delinquent"
      />

      <SubnavSectionLabel>Disputes</SubnavSectionLabel>
      <SubnavStatRow
        label="Open disputes"
        value={data.disputes.opened}
        tone={data.disputes.opened > 0 ? "warn" : "ok"}
        href="/fee-collection?tab=disputes"
      />
      <SubnavStatRow
        label="Resolved · 7d"
        value={data.disputes.resolved7d}
        tone="ok"
      />
    </SubnavShell>
  );
}

function DialogTriggerButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ttn-quick-action-btn" onClick={onClick}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="14"
        height="14"
      >
        <path
          d="M9 5l7 7-7 7"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function FeeCollectionFollowUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<DelinquentFeePetition[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [tone, setTone] = useState<DunningTone>("polite");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewBody, setPreviewBody] = useState<string>("");
  const [isSending, startSending] = useTransition();

  async function loadCandidates() {
    setLoading(true);
    try {
      const rows = await listDelinquentFeePetitions(20);
      setCandidates(rows);
      if (rows.length > 0) {
        setSelectedId(rows[0].petitionId);
        await refreshPreview(rows[0].petitionId, tone);
      } else {
        setSelectedId("");
        setPreviewBody("");
        setPreviewSubject("");
      }
    } catch {
      toast.error("Failed to load delinquent petitions");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPreview(petitionId: string, nextTone: DunningTone) {
    try {
      const result = await previewFeeCollectionFollowUp({
        petitionId,
        tone: nextTone,
      });
      setPreviewBody(result.body);
      setPreviewSubject(result.subject);
    } catch {
      setPreviewBody("");
      setPreviewSubject("");
    }
  }

  async function handleSelect(petitionId: string) {
    setSelectedId(petitionId);
    await refreshPreview(petitionId, tone);
  }

  async function handleToneChange(next: string) {
    const nextTone = next as DunningTone;
    setTone(nextTone);
    if (selectedId) {
      await refreshPreview(selectedId, nextTone);
    }
  }

  function handleSend() {
    if (!selectedId || !previewBody.trim()) return;
    startSending(async () => {
      const result = await sendFeeCollectionFollowUp(selectedId, tone);
      if (result.success) {
        toast.success(result.message ?? "Follow-up queued");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message ?? "Send failed");
      }
    });
  }

  const selected = candidates.find((c) => c.petitionId === selectedId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          void loadCandidates();
        } else {
          setSelectedId("");
          setPreviewBody("");
          setPreviewSubject("");
          setCandidates([]);
          setTone("polite");
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send dunning follow-up</DialogTitle>
          <DialogDescription>
            Pick a delinquent petition, choose a tone, preview the message,
            and send. Records a communications row and a
            fee_collection_follow_ups entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading queue…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delinquent petitions found.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Delinquent petition</Label>
                <Select value={selectedId} onValueChange={handleSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a petition" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.petitionId} value={c.petitionId}>
                        {c.claimantName} ({c.caseNumber}) · $
                        {(c.outstandingCents / 100).toLocaleString()} · {" "}
                        {c.daysSinceApproved}d
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && (
                  <p className="text-xs text-muted-foreground">
                    Outstanding: $
                    {(selected.outstandingCents / 100).toLocaleString()} ·{" "}
                    {selected.daysSinceApproved} days since approval
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={handleToneChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polite">Polite reminder</SelectItem>
                    <SelectItem value="firm">Firm — second notice</SelectItem>
                    <SelectItem value="escalation">
                      Escalation — final notice
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {previewSubject && (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <p className="text-sm font-mono text-foreground border border-border rounded-md bg-muted px-3 py-2">
                    {previewSubject}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Preview</Label>
                <Textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Template-only draft. Real LLM generation is a pending
                  follow-up.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              !selectedId || !previewBody.trim() || isSending || loading
            }
          >
            {isSending ? "Sending…" : "Confirm & send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
