"use client";

import * as React from "react";
import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type MetricTileProps = {
  label: string;
  value: React.ReactNode;
  help?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
};

/**
 * A small KPI tile that displays a label, a value, and an optional `?` info
 * button that opens a tooltip explaining the metric. The info trigger is
 * keyboard-focusable so keyboard + screen reader users can reach it.
 */
/**
 * Standalone `?`/info trigger — useful when you want a help tooltip next to
 * a heading or inline metric without rendering a full MetricTile.
 */
export function MetricHelpIcon({
  label,
  help,
  className,
}: {
  label: string;
  help: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={0}
            aria-label={`About ${label}`}
            className={cn(
              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left normal-case tracking-normal">
          {help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MetricTile({
  label,
  value,
  help,
  className,
  valueClassName,
  labelClassName,
}: MetricTileProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "flex items-center gap-1 text-[10px] uppercase tracking-[0.10em] text-muted-foreground",
          labelClassName,
        )}
      >
        <span>{label}</span>
        {help ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={0}
                  aria-label={`About ${label}`}
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="h-3 w-3" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <div
        className={cn(
          "text-[20px] font-semibold tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}
