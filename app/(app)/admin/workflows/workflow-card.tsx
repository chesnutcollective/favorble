"use client";

import { useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { FlashIcon } from "@hugeicons/core-free-icons";
import {
  deleteWorkflowTemplate,
  toggleWorkflowActive,
} from "@/app/actions/workflows";
import {
  EditWorkflowDialog,
  type WorkflowFormData,
} from "./new-workflow-dialog";
import { toast } from "sonner";

type Stage = {
  id: string;
  name: string;
  code: string;
};

const TEAM_LABELS: Record<string, string> = {
  intake: "Intake",
  filing: "Filing",
  medical_records: "Medical Records",
  mail_sorting: "Mail Sorting",
  case_management: "Case Mgmt",
  hearings: "Hearings",
  administration: "Admin",
};

type TaskTemplate = {
  id: string;
  title: string;
  assignToTeam: string | null;
  assignToRole: string | null;
  dueDaysOffset: number;
  dueBusinessDaysOnly: boolean;
  priority: string;
};

type WorkflowCardProps = {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    triggerStageId: string | null;
    isActive: boolean;
    notifyAssignees: boolean;
    notifyCaseManager: boolean;
    sendClientMessage: boolean;
    triggerStageName: string | null;
    triggerStageCode: string | null;
    taskTemplates: TaskTemplate[];
  };
  stages: Stage[];
};

export function WorkflowCard({ workflow: wf, stages }: WorkflowCardProps) {
  const [isPending, startTransition] = useTransition();

  const editData: WorkflowFormData = {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    triggerStageId: wf.triggerStageId,
    isActive: wf.isActive,
  };

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteWorkflowTemplate(wf.id);
        toast.success("Workflow deleted.");
      } catch {
        toast.error("Failed to delete workflow.");
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      try {
        await toggleWorkflowActive(wf.id);
        toast.success(
          wf.isActive
            ? "Workflow marked as draft."
            : "Workflow marked as active.",
        );
      } catch {
        toast.error("Failed to update workflow.");
      }
    });
  }

  return (
    <Card key={wf.id}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HugeiconsIcon icon={FlashIcon} size={16} color="rgb(245 158 11)" aria-hidden="true" />
            <CardTitle className="text-base">{wf.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={wf.isActive}
              aria-label={`Workflow ${wf.name} active`}
              disabled={isPending}
              onClick={handleToggleActive}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  handleToggleActive();
                }
              }}
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed",
                wf.isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {wf.isActive ? "Active" : "Draft"}
            </button>
            <EditWorkflowDialog workflow={editData} stages={stages}>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Edit
              </Button>
            </EditWorkflowDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  disabled={isPending}
                >
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the workflow &quot;{wf.name}
                    &quot; and all its task templates. This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isPending ? "Deleting..." : "Delete Workflow"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {wf.description && (
          <p className="text-sm text-muted-foreground ml-7">{wf.description}</p>
        )}
        <p className="text-xs text-muted-foreground ml-7">
          Trigger: Stage &rarr;{" "}
          <span className="font-medium">
            {wf.triggerStageName ?? "Unknown"}
          </span>{" "}
          ({wf.triggerStageCode})
        </p>
      </CardHeader>
      <CardContent>
        {wf.taskTemplates.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/70">
            No tasks configured yet. Add task templates above.
          </p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-accent">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Task
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Assign To
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Due
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                {wf.taskTemplates.map((tt: TaskTemplate, i: number) => (
                  <tr key={tt.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {tt.title}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {tt.assignToTeam
                        ? (TEAM_LABELS[tt.assignToTeam] ?? tt.assignToTeam)
                        : (tt.assignToRole ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      +{tt.dueDaysOffset}{" "}
                      {tt.dueBusinessDaysOnly ? "bus" : "cal"} days
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          tt.priority === "urgent" || tt.priority === "high"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {tt.priority}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {wf.notifyAssignees && <span>Notify assignees</span>}
          {wf.notifyCaseManager && <span>Notify case manager</span>}
          {wf.sendClientMessage && <span>Send client message</span>}
        </div>
      </CardContent>
    </Card>
  );
}
