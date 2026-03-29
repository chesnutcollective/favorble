"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  extracting: "bg-blue-100 text-blue-700 border-blue-200",
  classifying: "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
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
