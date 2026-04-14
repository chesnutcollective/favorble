"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { StageChangeDialog } from "./stage-change-dialog";
import {
  changeCaseStage,
  getAllowedNextStages,
  previewStageChange,
} from "@/app/actions/cases";

type Stage = {
  id: string;
  name: string;
  code: string;
  stageGroupId: string;
  stageGroupName: string;
  stageGroupColor: string | null;
  displayOrder: number;
  groupDisplayOrder: number;
};

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

type CaseStageSelectorProps = {
  caseId: string;
  currentStageId: string | null;
  currentStageName: string | null;
  currentStageGroupColor: string | null;
};

export function CaseStageSelector({
  caseId,
  currentStageId,
  currentStageName,
  currentStageGroupColor,
}: CaseStageSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowPreview[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [allowedStages, setAllowedStages] = useState<Stage[]>([]);
  const [stagesLoaded, setStagesLoaded] = useState(false);

  async function loadStages() {
    if (stagesLoaded) return;
    const stages = await getAllowedNextStages(caseId);
    setAllowedStages(stages);
    setStagesLoaded(true);
  }

  async function handleStageSelect(stageId: string) {
    const stage = allowedStages.find((s) => s.id === stageId);
    if (!stage) return;

    setSelectedStage(stage);
    setDialogOpen(true);
    setIsLoadingPreview(true);

    try {
      const preview = await previewStageChange(stageId);
      setWorkflows(preview);
    } catch {
      setWorkflows([]);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  function handleConfirm() {
    if (!selectedStage) return;

    startTransition(async () => {
      try {
        const result = await changeCaseStage({
          caseId,
          newStageId: selectedStage.id,
        });
        if (result?.externalSync === "failed") {
          toast.warning(
            "Stage updated locally, but CaseStatus sync failed. Client portal may be out of date.",
          );
        } else {
          toast.success(`Status updated to ${selectedStage.name}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update status";
        toast.error(message);
      } finally {
        setDialogOpen(false);
        setSelectedStage(null);
        setStagesLoaded(false);
        router.refresh();
      }
    });
  }

  // Group stages by stageGroupName for the dropdown
  const groupedStages = allowedStages.reduce<
    Record<string, { color: string | null; stages: Stage[] }>
  >((acc, stage) => {
    if (!acc[stage.stageGroupName]) {
      acc[stage.stageGroupName] = {
        color: stage.stageGroupColor,
        stages: [],
      };
    }
    acc[stage.stageGroupName].stages.push(stage);
    return acc;
  }, {});

  return (
    <>
      <Select
        value=""
        onValueChange={handleStageSelect}
        onOpenChange={(open) => {
          if (open) loadStages();
        }}
      >
        <SelectTrigger
          aria-label="Update Status"
          className="h-auto w-auto gap-1.5 border border-border bg-white px-2.5 py-1 text-sm font-medium shadow-none hover:border-[#CCC] focus:ring-0 focus:ring-offset-0"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Update Status:</span>
            <span
              className="font-semibold"
              style={{ color: currentStageGroupColor ?? undefined }}
            >
              {currentStageName ?? "No stage"}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groupedStages).map(([groupName, { stages }]) => (
            <SelectGroup key={groupName}>
              <SelectLabel>{groupName}</SelectLabel>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          {stagesLoaded && allowedStages.length === 0 && (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              No stage transitions available
            </div>
          )}
        </SelectContent>
      </Select>

      <StageChangeDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedStage(null);
        }}
        currentStageName={currentStageName ?? "Unknown"}
        newStageName={selectedStage?.name ?? ""}
        workflows={workflows}
        isLoading={isLoadingPreview || isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}
