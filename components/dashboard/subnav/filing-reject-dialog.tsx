"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  rejectFiling,
  getPendingFilings,
  type PendingFilingRow,
} from "@/app/actions/filing";
import {
  FILING_REJECT_REASON_CODES,
  FILING_REJECT_REASON_LABELS,
  type FilingRejectReasonCode,
} from "@/lib/filing/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — if the caller already knows which filing, skip the picker. */
  filingId?: string;
};

/**
 * Blocking reject-with-reason dialog for filings. Mirrors the intake "Decline
 * with reason" UX: pulls the pending-filing queue, defaults to the oldest, and
 * requires a reason code before the destructive-tone confirm button enables.
 */
export function FilingRejectDialog({ open, onOpenChange, filingId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filings, setFilings] = useState<PendingFilingRow[]>([]);
  const [selectedFilingId, setSelectedFilingId] = useState<string | undefined>(
    filingId,
  );
  const [reasonCode, setReasonCode] = useState<FilingRejectReasonCode | undefined>(
    undefined,
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Load the pending-filings list when the dialog opens and no specific
  // filingId was provided. Oldest-first so the default select is the one the
  // user most likely cares about.
  useEffect(() => {
    if (!open || filingId) return;
    let cancelled = false;
    setLoading(true);
    getPendingFilings()
      .then((rows) => {
        if (cancelled) return;
        setFilings(rows);
        if (rows.length > 0 && !selectedFilingId) {
          setSelectedFilingId(rows[0].taskId);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Could not load filing queue",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, filingId, selectedFilingId]);

  // Reset form state whenever the dialog closes, so re-opening is clean.
  useEffect(() => {
    if (open) return;
    setReasonCode(undefined);
    setNotes("");
    if (!filingId) setSelectedFilingId(undefined);
  }, [open, filingId]);

  const canConfirm =
    !!selectedFilingId && !!reasonCode && !pending && !loading;

  function handleConfirm() {
    if (!selectedFilingId || !reasonCode) return;
    const id = selectedFilingId;
    const code = reasonCode;
    const trimmedNotes = notes.trim() || undefined;

    startTransition(async () => {
      try {
        const result = await rejectFiling(id, code, trimmedNotes);
        if (result.success) {
          toast.success(result.message ?? "Filing rejected");
          router.refresh();
          onOpenChange(false);
        } else {
          toast.error(result.message ?? "Could not reject filing");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reject filing");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject filing</DialogTitle>
          <DialogDescription>
            Record why this filing is being rejected. The reason is logged to
            the HIPAA audit trail and surfaced on the case timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!filingId && (
            <div className="grid gap-1.5">
              <Label htmlFor="filing-picker">Filing</Label>
              <Select
                value={selectedFilingId}
                onValueChange={setSelectedFilingId}
                disabled={loading || filings.length === 0}
              >
                <SelectTrigger id="filing-picker">
                  <SelectValue
                    placeholder={
                      loading
                        ? "Loading filings…"
                        : filings.length === 0
                          ? "No pending filings"
                          : "Select a filing"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filings.map((f) => (
                    <SelectItem key={f.taskId} value={f.taskId}>
                      <span className="truncate">
                        {f.caseNumber} · {f.claimantName} · {f.daysWaiting}d
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filings.length > 0 && !loading && (
                <p className="text-xs text-muted-foreground">
                  Defaulted to oldest pending filing.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Select
              value={reasonCode}
              onValueChange={(v) =>
                setReasonCode(v as FilingRejectReasonCode)
              }
            >
              <SelectTrigger id="reject-reason">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {FILING_REJECT_REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {FILING_REJECT_REASON_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reject-notes">Notes (optional)</Label>
            <Textarea
              id="reject-notes"
              placeholder="Add context for the attorney or case manager…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {pending ? "Rejecting…" : "Reject filing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
