"use client";

import { useState, useTransition, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
  createWorkflowTemplate,
  updateWorkflowTemplate,
} from "@/app/actions/workflows";
import { toast } from "sonner";

type Stage = {
  id: string;
  name: string;
  code: string;
};

export type WorkflowFormData = {
  id: string;
  name: string;
  description: string | null;
  triggerStageId: string | null;
  isActive: boolean;
};

export function NewWorkflowDialog({ stages }: { stages: Stage[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerStageId, setTriggerStageId] = useState("");
  const [isActive, setIsActive] = useState(false);

  function resetForm() {
    setName("");
    setDescription("");
    setTriggerStageId("");
    setIsActive(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        await createWorkflowTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          triggerType: "stage_enter",
          triggerStageId: triggerStageId || undefined,
        });
        toast.success("Workflow created.");
        resetForm();
        setOpen(false);
      } catch {
        toast.error("Failed to create workflow.");
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
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>
              Create an automated workflow triggered by stage changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wf-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Case Intake Tasks"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-description">Description</Label>
              <Textarea
                id="wf-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-trigger-stage">Trigger Stage</Label>
              <Select value={triggerStageId} onValueChange={setTriggerStageId}>
                <SelectTrigger id="wf-trigger-stage">
                  <SelectValue placeholder="Select a stage..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.code} - {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wf-active">Active</Label>
              <Switch
                id="wf-active"
                checked={isActive}
                onCheckedChange={setIsActive}
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
              {isPending ? "Creating..." : "Create Workflow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditWorkflowDialog({
  workflow,
  stages,
  children,
}: {
  workflow: WorkflowFormData;
  stages: Stage[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? "");
  const [triggerStageId, setTriggerStageId] = useState(
    workflow.triggerStageId ?? "",
  );
  const [isActive, setIsActive] = useState(workflow.isActive);

  useEffect(() => {
    if (open) {
      setName(workflow.name);
      setDescription(workflow.description ?? "");
      setTriggerStageId(workflow.triggerStageId ?? "");
      setIsActive(workflow.isActive);
    }
  }, [open, workflow]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        await updateWorkflowTemplate(workflow.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          triggerStageId: triggerStageId || undefined,
          isActive,
        });
        toast.success("Workflow updated.");
        setOpen(false);
      } catch {
        toast.error("Failed to update workflow.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Workflow</DialogTitle>
            <DialogDescription>Update workflow settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wf-edit-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="wf-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Case Intake Tasks"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-edit-description">Description</Label>
              <Textarea
                id="wf-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-edit-trigger-stage">Trigger Stage</Label>
              <Select value={triggerStageId} onValueChange={setTriggerStageId}>
                <SelectTrigger id="wf-edit-trigger-stage">
                  <SelectValue placeholder="Select a stage..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.code} - {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wf-edit-active">Active</Label>
              <Switch
                id="wf-edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
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
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
