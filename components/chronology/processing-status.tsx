"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "border border-[#EAEAEA] text-[#666] bg-transparent",
  extracting: "border border-[#EAEAEA] text-[#0070F3] bg-transparent",
  classifying: "border border-[#EAEAEA] text-[#0070F3] bg-transparent",
  completed: "border border-[#EAEAEA] text-[#00C853] bg-transparent",
  failed: "border border-[#EAEAEA] text-[#EE0000] bg-transparent",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  extracting: "Extracting",
  classifying: "Classifying",
  completed: "Completed",
  failed: "Failed",
};

type ProcessingStatusProps = {
  status: string;
  className?: string;
};

export function ProcessingStatus({ status, className }: ProcessingStatusProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
