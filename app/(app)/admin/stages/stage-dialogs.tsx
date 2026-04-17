"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import {
  createStageGroup,
  createStage,
  deleteStageWithMigration,
  getCasesInStageCount,
} from "@/app/actions/stages";
import { StageMigrationDialog } from "@/components/stages/stage-migration-dialog";
import { toast } from "sonner";

const TEAM_OPTIONS = [
  { value: "intake", label: "Intake" },
  { value: "filing", label: "Filing" },
  { value: "medical_records", label: "Medical Records" },
  { value: "mail_sorting", label: "Mail Sorting" },
  { value: "case_management", label: "Case Management" },
  { value: "hearings", label: "Hearings" },
  { value: "administration", label: "Administration" },
];

// ─── Add Stage Group Dialog ──────────────────────────────────

export function AddStageGroupDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [clientVisibleName, setClientVisibleName] = useState("");

  function resetForm() {
    setName("");
    setColor("#6B7280");
    setClientVisibleName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        await createStageGroup({
          name: name.trim(),
          color,
          clientVisibleName: clientVisibleName.trim() || undefined,
        });
        toast.success("Stage group created.");
        resetForm();
        setOpen(false);
      } catch {
        toast.error("Failed to create stage group.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" aria-hidden="true" />
          Add Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Stage Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize related case stages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sg-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pre-Filing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sg-color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="sg-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-input"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1"
                  placeholder="#6B7280"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sg-client-name">Client-Visible Name</Label>
              <Input
                id="sg-client-name"
                value={clientVisibleName}
                onChange={(e) => setClientVisibleName(e.target.value)}
                placeholder="What the client sees (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Stage Dialog ────────────────────────────────────────

type StageGroup = {
  id: string;
  name: string;
};

export function AddStageDialog({
  stageGroups,
  defaultGroupId,
}: {
  stageGroups: StageGroup[];
  defaultGroupId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [stageGroupId, setStageGroupId] = useState(defaultGroupId ?? "");
  const [owningTeam, setOwningTeam] = useState("");
  const [stageColor, setStageColor] = useState("");
  const [isInitialStage, setIsInitialStage] = useState(false);
  const [isTerminalStage, setIsTerminalStage] = useState(false);

  function resetForm() {
    setName("");
    setCode("");
    setStageGroupId(defaultGroupId ?? "");
    setOwningTeam("");
    setStageColor("");
    setIsInitialStage(false);
    setIsTerminalStage(false);
  }

  // Auto-generate code from name
  function handleNameChange(val: string) {
    setName(val);
    const autoCode = val
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 20);
    setCode(autoCode);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!code.trim()) {
      toast.error("Code is required.");
      return;
    }
    if (!stageGroupId) {
      toast.error("Stage group is required.");
      return;
    }

    startTransition(async () => {
      try {
        await createStage({
          stageGroupId,
          name: name.trim(),
          code: code.trim(),
          owningTeam: owningTeam || undefined,
          color: stageColor || undefined,
        });
        toast.success("Stage created.");
        resetForm();
        setOpen(false);
      } catch {
        toast.error("Failed to create stage.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-2 text-xs">
          <HugeiconsIcon icon={PlusSignIcon} size={12} className="mr-1" aria-hidden="true" />
          Add Stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Stage</DialogTitle>
            <DialogDescription>
              Create a new case stage within a group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="st-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="st-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Initial Review"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-code">
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="st-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. INITIAL_REVIEW"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-group">
                Stage Group <span className="text-red-500">*</span>
              </Label>
              <Select value={stageGroupId} onValueChange={setStageGroupId}>
                <SelectTrigger id="st-group">
                  <SelectValue placeholder="Select group..." />
                </SelectTrigger>
                <SelectContent>
                  {stageGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-color">Stage Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="st-color"
                  type="color"
                  value={stageColor || "#6B7280"}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-input"
                />
                <Input
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="flex-1"
                  placeholder="Inherit from group"
                />
                {stageColor && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStageColor("")}
                    className="text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to inherit the group color.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-team">Owning Team</Label>
              <Select value={owningTeam} onValueChange={setOwningTeam}>
                <SelectTrigger id="st-team">
                  <SelectValue placeholder="Select team (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="st-initial">Initial Stage</Label>
              <Switch
                id="st-initial"
                checked={isInitialStage}
                onCheckedChange={setIsInitialStage}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="st-terminal">Terminal Stage</Label>
              <Switch
                id="st-terminal"
                checked={isTerminalStage}
                onCheckedChange={setIsTerminalStage}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Stage Button (wired to StageMigrationDialog) ─────

type StageForDelete = {
  id: string;
  name: string;
  code: string;
};

export function DeleteStageButton({
  stage,
  allStages,
}: {
  stage: StageForDelete;
  allStages: StageForDelete[];
}) {
  const [open, setOpen] = useState(false);
  const [affectedCount, setAffectedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleOpenDelete() {
    setIsLoading(true);
    try {
      const count = await getCasesInStageCount(stage.id);
      setAffectedCount(count);
    } catch {
      setAffectedCount(0);
    }
    setIsLoading(false);
    setOpen(true);
  }

  function handleConfirm(destinationStageId: string) {
    startTransition(async () => {
      try {
        await deleteStageWithMigration(stage.id, destinationStageId);
        toast.success("Stage deleted and cases migrated.");
        setOpen(false);
      } catch {
        toast.error("Failed to delete stage.");
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-red-600 hover:text-red-700"
        onClick={handleOpenDelete}
        disabled={isLoading}
      >
        {isLoading ? "..." : "Delete"}
      </Button>
      <StageMigrationDialog
        open={open}
        onOpenChange={setOpen}
        stageToDelete={stage}
        affectedCaseCount={affectedCount}
        availableStages={allStages}
        onConfirm={handleConfirm}
        isLoading={isPending}
      />
    </>
  );
}
