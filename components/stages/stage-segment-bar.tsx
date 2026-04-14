"use client";

/**
 * D5 — Per-stage segment progress bar.
 *
 * Renders one segment per individual stage within the current stage group
 * (not 5 group buckets). Completed stages are filled brand indigo, the
 * current stage is outlined, upcoming stages are muted zinc.
 *
 * On narrow viewports the bar collapses to prev / current / next with an
 * ellipsis between outer stages and that window.
 */

import { cn } from "@/lib/utils";

export type StageSegment = {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
};

type StageSegmentBarProps = {
  stages: StageSegment[];
  currentStageId: string | null;
};

const BRAND_INDIGO = "#263c94";

export function StageSegmentBar({
  stages,
  currentStageId,
}: StageSegmentBarProps) {
  if (stages.length === 0) {
    return (
      <div
        className="h-2 rounded-full bg-zinc-200"
        aria-label="No stages configured"
      />
    );
  }

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  // Build a "collapsed" window for mobile: always show prev (if any),
  // current, next (if any). Anything outside that window collapses to an
  // ellipsis segment.
  const windowStart = Math.max(0, safeIndex - 1);
  const windowEnd = Math.min(stages.length - 1, safeIndex + 1);

  return (
    <div className="space-y-1.5">
      {/* Full bar — hidden on mobile */}
      <div
        className="hidden sm:flex items-center gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stages.length}
        aria-valuenow={safeIndex + 1}
        aria-label={`Stage ${safeIndex + 1} of ${stages.length}: ${
          stages[safeIndex]?.name ?? "unknown"
        }`}
      >
        {stages.map((stage, i) => (
          <Segment
            key={stage.id}
            stage={stage}
            state={
              i < safeIndex
                ? "completed"
                : i === safeIndex
                  ? "current"
                  : "upcoming"
            }
          />
        ))}
      </div>

      {/* Collapsed bar — mobile only: prev · current · next, with optional
          ellipses on either side to show there's more beyond the window. */}
      <div
        className="flex sm:hidden items-center gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stages.length}
        aria-valuenow={safeIndex + 1}
        aria-label={`Stage ${safeIndex + 1} of ${stages.length}: ${
          stages[safeIndex]?.name ?? "unknown"
        }`}
      >
        {windowStart > 0 && <Ellipsis />}
        {stages.slice(windowStart, windowEnd + 1).map((stage) => {
          const i = stages.indexOf(stage);
          return (
            <Segment
              key={stage.id}
              stage={stage}
              state={
                i < safeIndex
                  ? "completed"
                  : i === safeIndex
                    ? "current"
                    : "upcoming"
              }
            />
          );
        })}
        {windowEnd < stages.length - 1 && <Ellipsis />}
      </div>

      {/* Stage labels — full on desktop, compact on mobile */}
      <div className="hidden sm:flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {stages.map((stage, i) => (
          <span
            key={stage.id}
            className={cn(
              i === safeIndex && "font-medium text-foreground",
            )}
            title={`${stage.code} — ${stage.name}`}
          >
            {stage.name}
          </span>
        ))}
      </div>
      <p className="sm:hidden text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {stages[safeIndex]?.name}
        </span>{" "}
        &middot; {safeIndex + 1} of {stages.length}
      </p>
    </div>
  );
}

type SegmentState = "completed" | "current" | "upcoming";

function Segment({
  stage,
  state,
}: {
  stage: StageSegment;
  state: SegmentState;
}) {
  const isCurrent = state === "current";
  const isCompleted = state === "completed";
  return (
    <div
      className={cn(
        "flex-1 h-2 rounded-full transition-colors",
        isCompleted && "border-0",
        isCurrent && "border-[1.5px]",
        !isCompleted && !isCurrent && "bg-zinc-200",
      )}
      style={
        isCompleted
          ? { backgroundColor: BRAND_INDIGO }
          : isCurrent
            ? { borderColor: BRAND_INDIGO, backgroundColor: "transparent" }
            : undefined
      }
      title={`${stage.code} — ${stage.name}`}
    />
  );
}

function Ellipsis() {
  return (
    <span
      className="flex h-2 w-3 items-center justify-center text-[10px] text-zinc-400"
      aria-hidden
    >
      &hellip;
    </span>
  );
}
