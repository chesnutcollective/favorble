"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Stage = {
  id: string;
  name: string;
  code: string;
};

type StageMigrationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageToDelete: Stage;
  affectedCaseCount: number;
  availableStages: Stage[];
  onConfirm: (destinationStageId: string) => void;
  isLoading?: boolean;
};

export function StageMigrationDialog({
  open,
  onOpenChange,
  stageToDelete,
  affectedCaseCount,
  availableStages,
  onConfirm,
  isLoading = false,
}: StageMigrationDialogProps) {
  const [destinationStageId, setDestinationStageId] = useState<string>("");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Stage: {stageToDelete.name}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                There {affectedCaseCount === 1 ? "is" : "are"}{" "}
                <span className="font-semibold text-foreground">
                  {affectedCaseCount} case{affectedCaseCount !== 1 ? "s" : ""}
                </span>{" "}
                currently in this stage. All cases must be migrated to a new
                stage before deletion.
              </p>

              <div>
                <label
                  htmlFor="destination-stage"
                  className="block text-sm font-medium text-foreground"
                >
                  Move cases to:
                </label>
                <Select
                  value={destinationStageId}
                  onValueChange={setDestinationStageId}
                >
                  <SelectTrigger id="destination-stage" className="mt-1">
                    <SelectValue placeholder="Select destination stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStages
                      .filter((s) => s.id !== stageToDelete.id)
                      .map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.code} - {stage.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {destinationStageId && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  This will migrate{" "}
                  <span className="font-medium">{affectedCaseCount}</span> case
                  {affectedCaseCount !== 1 ? "s" : ""} from{" "}
                  <span className="font-medium">{stageToDelete.name}</span> to{" "}
                  <span className="font-medium">
                    {
                      availableStages.find((s) => s.id === destinationStageId)
                        ?.name
                    }
                  </span>{" "}
                  and then delete the stage. This action cannot be undone.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (destinationStageId) {
                onConfirm(destinationStageId);
              }
            }}
            disabled={!destinationStageId || isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading
              ? "Migrating..."
              : `Migrate ${affectedCaseCount} Case${affectedCaseCount !== 1 ? "s" : ""} & Delete Stage`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
