"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeCaseOnHold, type HoldCaseReason } from "@/app/actions/cases";

type CaseHoldDialogProps = {
  caseId: string;
};

const REASON_OPTIONS: Array<{ value: HoldCaseReason; label: string }> = [
  { value: "client_unresponsive", label: "Client unresponsive" },
  { value: "medical_pending", label: "Medical pending" },
  { value: "awaiting_docs", label: "Awaiting docs" },
  { value: "other", label: "Other" },
];

export function CaseHoldDialog({ caseId }: CaseHoldDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<HoldCaseReason>("client_unresponsive");
  const [holdUntil, setHoldUntil] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  function resetForm() {
    setReason("client_unresponsive");
    setHoldUntil("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const holdUntilDate = holdUntil
      ? new Date(`${holdUntil}T00:00:00`)
      : null;

    if (holdUntilDate && Number.isNaN(holdUntilDate.getTime())) {
      toast.error("Invalid hold-until date.");
      return;
    }

    startTransition(async () => {
      try {
        await placeCaseOnHold(
          caseId,
          reason,
          holdUntilDate,
          notes.trim() || undefined,
        );
        toast.success("Case placed on hold.");
        resetForm();
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to place case on hold.";
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
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Place on Hold
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Place Case on Hold</DialogTitle>
          <DialogDescription>
            Pause work on this case. You can set a date to auto-remind yourself
            to revisit it and optionally leave notes for the audit trail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="hold-reason">Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as HoldCaseReason)}
            >
              <SelectTrigger id="hold-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hold-until">Hold until (optional)</Label>
            <Input
              id="hold-until"
              type="date"
              value={holdUntil}
              onChange={(e) => setHoldUntil(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hold-notes">Notes (optional)</Label>
            <Textarea
              id="hold-notes"
              rows={3}
              placeholder="Add context for the audit trail…"
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Place on Hold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
