"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { markOldestMrCompleteAction } from "@/app/actions/dashboard-quick-actions";
import {
  listPendingProviderFollowUps,
  previewProviderFollowUp,
  sendProviderFollowUp,
  type PendingProviderFollowUp,
} from "@/app/actions/rfc-follow-ups";
import { COLORS } from "@/lib/design-tokens";
import type { MedicalRecordsSubnavData } from "@/lib/dashboard-subnav/types";

export function MedicalRecordsSubnav({
  data,
}: {
  data: MedicalRecordsSubnavData;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SubnavShell title="Records Desk">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <DialogTriggerButton
          label="Send AI follow-up"
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <SubnavActionGrid
        actions={[
          {
            label: "Mark oldest complete",
            onAction: markOldestMrCompleteAction,
          },
          { label: "Generate RFC", href: "/medical-records?tab=rfc" },
          { label: "Open vault", href: "/medical-records?tab=credentials" },
        ]}
      />

      <SendProviderFollowUpDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <SubnavSectionLabel>Watch List</SubnavSectionLabel>
      <SubnavStatRow
        label="Expiring credentials"
        value={data.expiringCredentials}
        tone={data.expiringCredentials > 0 ? "warn" : "ok"}
        href="/medical-records?tab=credentials"
      />
      <SubnavStatRow
        label="RFC awaiting doctor"
        value={data.rfcAwaitingDoctor}
        tone={data.rfcAwaitingDoctor > 0 ? "warn" : "default"}
        href="/medical-records?tab=rfc"
      />

      {/* Anchor: Provider response-time intelligence — ranked slowest first */}
      <SubnavSectionLabel>Slowest Providers</SubnavSectionLabel>
      <SubnavAnchorBlock label="Days since last response">
        {data.providerResponseTimes.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No provider activity yet.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {data.providerResponseTimes.map((p) => {
              const days = p.avgDays ?? 0;
              const tone =
                days > 30 ? COLORS.bad : days > 14 ? COLORS.warn : COLORS.text2;
              return (
                <li
                  key={p.name}
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
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: tone,
                    }}
                  >
                    {p.avgDays === null ? "—" : `${p.avgDays}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Recently Completed</SubnavSectionLabel>
      <SubnavRecentList items={data.recentCompleted} />
    </SubnavShell>
  );
}

/**
 * Lightweight dialog-trigger button styled to match SubnavActionGrid items.
 * Inlined here so we don't have to modify `_primitives.tsx` (scope).
 */
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

function SendProviderFollowUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<PendingProviderFollowUp[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [previewBody, setPreviewBody] = useState<string>("");
  const [isSending, startSending] = useTransition();

  async function loadCandidates() {
    setLoading(true);
    try {
      const rows = await listPendingProviderFollowUps(20);
      setCandidates(rows);
      if (rows.length > 0) {
        setSelectedId(rows[0].requestId);
        await refreshPreview(rows[0].requestId);
      } else {
        setSelectedId("");
        setPreviewBody("");
      }
    } catch {
      toast.error("Failed to load pending providers");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPreview(requestId: string) {
    try {
      const result = await previewProviderFollowUp({ requestId });
      setPreviewBody(result.body);
    } catch {
      setPreviewBody("");
    }
  }

  async function handleSelect(requestId: string) {
    setSelectedId(requestId);
    await refreshPreview(requestId);
  }

  function handleSend() {
    if (!selectedId || !previewBody.trim()) return;
    startSending(async () => {
      const result = await sendProviderFollowUp(selectedId, previewBody);
      if (result.success) {
        toast.success(result.message ?? "Follow-up queued");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message ?? "Send failed");
      }
    });
  }

  const selected = candidates.find((c) => c.requestId === selectedId);

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
          setCandidates([]);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send AI follow-up</DialogTitle>
          <DialogDescription>
            Pick a pending provider request, preview the message, and send a
            reminder. Records a communications row for downstream delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading queue…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending provider requests found. Great work.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Pending provider request</Label>
                <Select value={selectedId} onValueChange={handleSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a request" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.requestId} value={c.requestId}>
                        {c.providerName} — {c.claimantName} ({c.caseNumber})
                        {c.daysOverdue > 0
                          ? ` · ${c.daysOverdue}d overdue`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && (
                  <p className="text-xs text-muted-foreground">
                    Case {selected.caseNumber} · claimant{" "}
                    {selected.claimantName}
                    {selected.daysOverdue > 0
                      ? ` · ${selected.daysOverdue} day(s) overdue`
                      : ""}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <Textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Template-only draft. Edit as needed before sending. Real LLM
                  generation is a pending follow-up.
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
