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
  /** Optional primary action rendered below the description. */
  action?: ReactNode;
  /** Optional secondary text or link rendered below the action. */
  secondary?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  className,
  action,
  secondary,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className,
      )}
    >
      <HugeiconsIcon icon={icon} size={24} color="#999" />
      <h3 className="mt-4 text-[14px] font-medium text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-[#666]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
      {secondary && (
        <div className="mt-2 text-xs text-[#666]">{secondary}</div>
      )}
    </div>
  );
}
