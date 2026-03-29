"use client";

import { useState, useRef, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { reorderStages } from "@/app/actions/stages";
import { DeleteStageButton } from "./stage-dialogs";
import { toast } from "sonner";

type StageItem = {
  id: string;
  name: string;
  code: string;
  color: string | null;
  isInitial: boolean;
  isTerminal: boolean;
  owningTeam: string | null;
};

type DraggableStageListProps = {
  stages: StageItem[];
  groupColor: string | null;
  allStages: { id: string; name: string; code: string }[];
  teamLabels: Record<string, string>;
};

export function DraggableStageList({
  stages: initialStages,
  groupColor,
  allStages,
  teamLabels,
}: DraggableStageListProps) {
  const [stages, setStages] = useState(initialStages);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragCounter = useRef(0);

  function handleDragStart(e: React.DragEvent, index: number) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  }

  function handleDragEnter(e: React.DragEvent, index: number) {
    e.preventDefault();
    dragCounter.current++;
    setDragOverIndex(index);
  }

  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    setDragOverIndex(null);
    dragCounter.current = 0;

    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setStages(reordered);
    setDraggedIndex(null);

    // Persist the new order
    startTransition(async () => {
      try {
        await reorderStages(reordered.map((s) => s.id));
      } catch {
        toast.error("Failed to save stage order.");
        setStages(initialStages);
      }
    });
  }

  return (
    <div className="space-y-2">
      {stages.map((stage, index) => {
        const badgeColor = stage.color ?? groupColor ?? "#6B7280";
        return (
          <div
            key={stage.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={`flex items-center justify-between rounded-md border p-3 transition-all cursor-grab active:cursor-grabbing ${
              draggedIndex === index ? "opacity-50" : ""
            } ${
              dragOverIndex === index && draggedIndex !== index
                ? "border-primary bg-accent"
                : ""
            } ${isPending ? "opacity-70" : ""}`}
          >
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                icon={DragDropVerticalIcon}
                size={16}
                className="text-muted-foreground shrink-0"
              />
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: badgeColor }}
                title={stage.color ? "Custom color" : "Group color"}
              />
              <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {stage.code}
              </code>
              <span className="text-sm font-medium text-foreground">
                {stage.name}
              </span>
              {stage.isInitial && (
                <Badge
                  variant="outline"
                  className="text-xs text-green-600 border-green-300"
                >
                  Initial
                </Badge>
              )}
              {stage.isTerminal && (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  Terminal
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {stage.owningTeam && (
                <Badge variant="secondary" className="text-xs">
                  {teamLabels[stage.owningTeam] ?? stage.owningTeam}
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Edit
              </Button>
              <DeleteStageButton
                stage={{
                  id: stage.id,
                  name: stage.name,
                  code: stage.code,
                }}
                allStages={allStages}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
