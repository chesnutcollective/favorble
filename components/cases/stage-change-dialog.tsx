"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

type WorkflowPreview = {
  id: string;
  name: string;
  description: string | null;
  taskCount: number;
  tasks: Array<{
    title: string;
    assignToTeam: string | null;
    dueDaysOffset: number;
  }>;
};

type StageChangeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStageName: string;
  newStageName: string;
  workflows: WorkflowPreview[];
  isLoading: boolean;
  onConfirm: () => void;
};

export function StageChangeDialog({
  open,
  onOpenChange,
  currentStageName,
  newStageName,
  workflows,
  isLoading,
  onConfirm,
}: StageChangeDialogProps) {
  const totalTasks = workflows.reduce((sum, w) => sum + w.taskCount, 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Stage Change</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p>
                Move case from{" "}
                <span className="font-medium text-gray-900">
                  {currentStageName}
                </span>{" "}
                to{" "}
                <span className="font-medium text-gray-900">
                  {newStageName}
                </span>
                ?
              </p>

              {isLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  Checking workflows...
                </div>
              ) : workflows.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    This will trigger {workflows.length} workflow
                    {workflows.length > 1 ? "s" : ""} creating {totalTasks} task
                    {totalTasks > 1 ? "s" : ""}:
                  </p>

                  {workflows.map((workflow) => (
                    <div
                      key={workflow.id}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {workflow.name}
                      </p>
                      {workflow.description && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {workflow.description}
                        </p>
                      )}
                      <div className="mt-2 space-y-1">
                        {workflow.tasks.map((task, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-gray-600"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            <span className="flex-1">{task.title}</span>
                            {task.assignToTeam && (
                              <Badge variant="outline" className="text-xs">
                                {task.assignToTeam}
                              </Badge>
                            )}
                            <span className="text-gray-400">
                              +{task.dueDaysOffset}d
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  No automated workflows are configured for this stage.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {workflows.length > 0
              ? `Change Stage & Create ${totalTasks} Task${totalTasks > 1 ? "s" : ""}`
              : "Change Stage"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
