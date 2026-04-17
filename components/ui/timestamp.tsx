"use client";

import * as React from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type TimestampProps = {
  /** Date value — ISO string, Date instance, or epoch milliseconds. */
  value: string | Date | number | null | undefined;
  /**
   * Render mode.
   * - `relative` (default): "6 days ago", "41 minutes ago"
   * - `absolute`: "Apr 10, 2026 9:42 AM"
   */
  mode?: "relative" | "absolute";
  /**
   * When `mode="relative"`, include the "ago" / "in …" suffix.
   * Defaults to `true`. Set to `false` for bare forms like "6d".
   */
  suffix?: boolean;
  /** Optional className forwarded to the rendered <time> element. */
  className?: string;
  /** Fallback string when `value` is missing or invalid. Defaults to an em-dash. */
  fallback?: string;
  /**
   * Optional pre-computed label to render instead of the internally computed
   * relative / absolute string. Use this when the surrounding component
   * already produces a domain-specific shorthand (e.g. "5d", "12 min ago")
   * and you only want to add the hover-for-absolute tooltip on top.
   */
  children?: React.ReactNode;
};

/**
 * Timestamp — renders a relative or absolute time and exposes the
 * absolute, localized timestamp on hover / focus via a shadcn Tooltip.
 *
 * Uses <time dateTime="…"> for semantic HTML / screen readers.
 * Self-contained: wraps its own TooltipProvider so it works without
 * a global provider in the layout tree.
 */
export function Timestamp({
  value,
  mode = "relative",
  suffix = true,
  className,
  fallback = "—",
  children,
}: TimestampProps) {
  const date = React.useMemo(() => {
    if (value === null || value === undefined || value === "") return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);

  if (!date) {
    return <span className={className}>{fallback}</span>;
  }

  const absolute = format(date, "MMM d, yyyy h:mm a");
  const relative = formatDistanceToNowStrict(date, { addSuffix: suffix });
  const label =
    children ?? (mode === "absolute" ? absolute : relative);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <time dateTime={date.toISOString()} className={cn(className)}>
            {label}
          </time>
        </TooltipTrigger>
        <TooltipContent>{absolute}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
