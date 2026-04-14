"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { declineLead, getOldestIntakeLead } from "@/app/actions/leads";

const REASON_OPTIONS = [
  { value: "not_qualified", label: "Not qualified" },
  { value: "not_ssdi_case", label: "Not an SSDI case" },
  { value: "too_late", label: "Too late / outside window" },
  { value: "duplicate", label: "Duplicate lead" },
  { value: "other", label: "Other" },
] as const;

type LeadContext = Awaited<ReturnType<typeof getOldestIntakeLead>>;

/**
 * Intake Floor · Decline-with-reason quick action.
 *
 * Picks the oldest actionable intake lead on open (same pattern as
 * `completeTopOpenTaskAction` in dashboard-quick-actions), then lets the
 * user tag it with a structured reason + optional notes before calling
 * `declineLead`.
 */
export function IntakeDeclineDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<LeadContext>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [reason, setReason] = useState<string>("not_qualified");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoadingLead(true);
      try {
        const top = await getOldestIntakeLead();
        setLead(top);
      } catch {
        setLead(null);
      } finally {
        setLoadingLead(false);
      }
    } else {
      // Reset so the next open picks a fresh lead.
      setLead(null);
      setReason("not_qualified");
      setNotes("");
    }
  }

  function handleConfirm() {
    if (!lead) return;
    startTransition(async () => {
      try {
        const result = await declineLead(
          lead.id,
          reason,
          notes.trim() ? notes.trim() : undefined,
        );
        if (result.success) {
          toast.success(result.message ?? "Lead declined");
          router.refresh();
          setOpen(false);
        } else {
          toast.error(result.message ?? "Could not decline lead");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not decline lead");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline lead</DialogTitle>
          <DialogDescription>
            {loadingLead
              ? "Finding the oldest actionable lead…"
              : lead
                ? `Declining ${lead.firstName} ${lead.lastName}. Pick a reason code so trend analytics stay useful.`
                : "No actionable intake leads right now — nothing to decline."}
          </DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="decline-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="decline-reason">
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
            <div className="grid gap-1.5">
              <Label htmlFor="decline-notes">Notes (optional)</Label>
              <Textarea
                id="decline-notes"
                placeholder="Any extra context the next reviewer should see"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!lead || pending || loadingLead}
          >
            {pending ? "Declining…" : "Confirm decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
