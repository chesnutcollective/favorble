"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { COLORS } from "@/lib/design-tokens";
import { createTimeEntry } from "@/app/actions/billing";

type CaseOption = {
  id: string;
  caseNumber: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type NewTimeEntryDialogProps = {
  cases: CaseOption[];
};

const NO_CASE = "__none__";

/** Parses "1h 30m", "1.5h", "90m", or "90" into minutes. */
function parseDurationInput(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  // Pure number → minutes
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  // "Xh Ym" or "Xh" or "Ym" or "X.Yh"
  const hoursMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutesMatch = trimmed.match(/(\d+)\s*m/);

  let total = 0;
  if (hoursMatch) total += Number.parseFloat(hoursMatch[1]) * 60;
  if (minutesMatch) total += Number.parseInt(minutesMatch[1], 10);

  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}

export function NewTimeEntryDialog({ cases }: NewTimeEntryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [caseId, setCaseId] = useState<string>(NO_CASE);
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [billable, setBillable] = useState(true);
  const [hourlyRate, setHourlyRate] = useState("");
  const [entryDate, setEntryDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );

  function reset() {
    setCaseId(NO_CASE);
    setDescription("");
    setDuration("");
    setBillable(true);
    setHourlyRate("");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError('Enter a valid duration (e.g. "1h 30m", "90m", or "90").');
      return;
    }

    startTransition(async () => {
      try {
        await createTimeEntry({
          caseId: caseId === NO_CASE ? undefined : caseId,
          description: description.trim(),
          durationMinutes: minutes,
          billable,
          hourlyRate: hourlyRate.trim() || undefined,
          entryDate: entryDate ? new Date(entryDate) : undefined,
        });
        reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create time entry.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" style={{ backgroundColor: COLORS.brand }}>
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          New Time Entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New Time Entry</DialogTitle>
            <DialogDescription>
              Log billable or non-billable time against a case.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="time-case">Case</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger id="time-case">
                  <SelectValue placeholder="Select a case (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CASE}>No case</SelectItem>
                  {cases.map((c) => {
                    const client =
                      c.clientFirstName || c.clientLastName
                        ? `${c.clientFirstName ?? ""} ${c.clientLastName ?? ""}`.trim()
                        : "No client";
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.caseNumber ?? "—"} · {client}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-description">Description</Label>
              <Textarea
                id="time-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-duration">Duration</Label>
                <Input
                  id="time-duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="1h 30m"
                  required
                />
                <p className="text-[11px] text-[#666]">
                  Formats: "1h 30m", "90m", or "90"
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-rate">Hourly rate</Label>
                <Input
                  id="time-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="time-date">Entry date</Label>
                <Input
                  id="time-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox
                  checked={billable}
                  onCheckedChange={(v) => setBillable(v === true)}
                />
                <span>Billable</span>
              </label>
            </div>

            {error && (
              <p className="text-sm" style={{ color: COLORS.bad }}>
                {error}
              </p>
            )}
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
              disabled={isPending}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Saving..." : "Save entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
