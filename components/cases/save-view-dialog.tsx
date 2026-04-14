"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveView } from "@/app/actions/cases";

export function SaveViewDialog({
  open,
  onOpenChange,
  filters,
  sort,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Record<string, unknown>;
  sort: { sortBy?: string; sortDir?: "asc" | "desc" };
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveView({ name: name.trim(), filters, sort, isShared });
        setName("");
        setIsShared(false);
        onOpenChange(false);
        onSaved?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save view");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
          <DialogDescription>
            Give this filter combination a name so you can return to it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. High urgency hearings"
              autoFocus
            />
            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="view-shared"
              checked={isShared}
              onCheckedChange={(v) => setIsShared(v === true)}
            />
            <Label htmlFor="view-shared" className="font-normal">
              Share with team
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending ? "Saving..." : "Save view"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
