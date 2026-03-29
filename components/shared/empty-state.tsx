"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: IconSvgElement;
  title: string;
  description: string;
  className?: string;
  /** Accent color for the icon background circle. Defaults to "blue". */
  accent?: "blue" | "green" | "amber" | "red" | "gray";
  /** Optional primary action rendered below the description. */
  action?: ReactNode;
  /** Optional secondary text or link rendered below the action. */
  secondary?: ReactNode;
  /** Whether to show a dashed border around the empty state. Defaults to false. */
  bordered?: boolean;
};

const accentStyles = {
  blue: "bg-[rgba(59,89,152,0.08)] text-[#3b5998]",
  green: "bg-[rgba(43,138,62,0.08)] text-[#2b8a3e]",
  amber: "bg-[rgba(207,138,0,0.08)] text-[#cf8a00]",
  red: "bg-[rgba(209,69,59,0.08)] text-[#d1453b]",
  gray: "bg-[rgba(0,0,0,0.04)] text-[#8b8b97]",
};

export function EmptyState({
  icon,
  title,
  description,
  className,
  accent = "blue",
  action,
  secondary,
  bordered = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        bordered &&
          "rounded-lg border border-dashed border-[rgba(59,89,152,0.15)] py-14",
        className,
      )}
      style={{ animation: "emptyStateIn 0.3s ease-out" }}
    >
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          accentStyles[accent],
        )}
        style={{ animation: "emptyStateIconPulse 3s ease-in-out infinite" }}
      >
        <HugeiconsIcon icon={icon} size={28} />
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
      {secondary && (
        <div className="mt-2 text-xs text-muted-foreground">{secondary}</div>
      )}
    </div>
  );
}
