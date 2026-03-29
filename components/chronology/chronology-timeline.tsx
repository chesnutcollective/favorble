"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChronologyEntryItem } from "@/app/(app)/cases/[id]/chronology/client";

const ENTRY_TYPE_COLORS: Record<string, { dot: string; label: string }> = {
  office_visit: {
    dot: "bg-[#0070F3]",
    label: "border border-[#EAEAEA] text-[#0070F3]",
  },
  hospitalization: {
    dot: "bg-[#EE0000]",
    label: "border border-[#EAEAEA] text-[#EE0000]",
  },
  emergency: {
    dot: "bg-[#EE0000]",
    label: "border border-[#EAEAEA] text-[#EE0000]",
  },
  lab_result: {
    dot: "bg-[#00C853]",
    label: "border border-[#EAEAEA] text-[#00C853]",
  },
  imaging: {
    dot: "bg-[#0070F3]",
    label: "border border-[#EAEAEA] text-[#0070F3]",
  },
  mental_health: {
    dot: "bg-[#0070F3]",
    label: "border border-[#EAEAEA] text-[#0070F3]",
  },
  physical_therapy: {
    dot: "bg-[#0070F3]",
    label: "border border-[#EAEAEA] text-[#0070F3]",
  },
  surgery: {
    dot: "bg-[#EE0000]",
    label: "border border-[#EAEAEA] text-[#EE0000]",
  },
  prescription: {
    dot: "bg-[#00C853]",
    label: "border border-[#EAEAEA] text-[#00C853]",
  },
  diagnosis: {
    dot: "bg-[#666]",
    label: "border border-[#EAEAEA] text-[#666]",
  },
  functional_assessment: {
    dot: "bg-[#666]",
    label: "border border-[#EAEAEA] text-[#666]",
  },
  other: {
    dot: "bg-[#EAEAEA]",
    label: "border border-[#EAEAEA] text-[#666]",
  },
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  office_visit: "Office Visit",
  hospitalization: "Hospitalization",
  emergency: "Emergency",
  lab_result: "Lab Result",
  imaging: "Imaging",
  mental_health: "Mental Health",
  physical_therapy: "Physical Therapy",
  surgery: "Surgery",
  prescription: "Prescription",
  diagnosis: "Diagnosis",
  functional_assessment: "Functional Assessment",
  other: "Other",
};

type ChronologyTimelineProps = {
  entries: ChronologyEntryItem[];
  onEdit?: (entry: ChronologyEntryItem) => void;
};

export function ChronologyTimeline({
  entries,
  onEdit,
}: ChronologyTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="relative ml-4">
      {/* Vertical line */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-[#EAEAEA]" />

      <div className="space-y-0">
        {entries.map((entry, index) => {
          const isExpanded = expandedIds.has(entry.id);
          const colors =
            ENTRY_TYPE_COLORS[entry.entryType] ?? ENTRY_TYPE_COLORS.other;

          return (
            <div
              key={entry.id}
              className={cn(
                "relative pl-8 pb-6",
                entry.isExcluded && "opacity-50",
              )}
            >
              {/* Dot — 8px */}
              <div
                className={cn(
                  "absolute left-2 top-2 h-2 w-2 rounded-full",
                  colors.dot,
                )}
              />

              {/* Content */}
              <div className="bg-white border border-[#EAEAEA] rounded-md p-4 hover:border-[#CCC] transition-colors duration-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-[#666]">
                        {entry.eventDate
                          ? new Date(entry.eventDate).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )
                          : "No date"}
                      </span>
                      <Badge className={cn("text-xs bg-transparent", colors.label)}>
                        {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                      </Badge>
                      {entry.isVerified && (
                        <Badge
                          variant="outline"
                          className="text-xs text-[#00C853] border-[#EAEAEA]"
                        >
                          Verified
                        </Badge>
                      )}
                      {entry.isExcluded && (
                        <Badge
                          variant="outline"
                          className="text-xs text-[#666] border-[#EAEAEA]"
                        >
                          Excluded
                        </Badge>
                      )}
                    </div>

                    {entry.providerName && (
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {entry.providerName}
                        {entry.facilityName && (
                          <span className="font-normal text-[#666]">
                            {" "}
                            at {entry.facilityName}
                          </span>
                        )}
                      </p>
                    )}

                    <p className="mt-1 text-[13px] text-foreground">
                      {entry.summary}
                    </p>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {entry.details && (
                          <div>
                            <p className="text-xs font-medium text-[#666]">
                              Details
                            </p>
                            <p className="text-[13px] text-foreground">
                              {entry.details}
                            </p>
                          </div>
                        )}
                        {entry.diagnoses && entry.diagnoses.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[#666]">
                              Diagnoses
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.diagnoses.map((d, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs border-[#EAEAEA] text-[#666]"
                                >
                                  {d}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {entry.treatments && entry.treatments.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[#666]">
                              Treatments
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.treatments.map((t, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs border-[#EAEAEA] text-[#666]"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {entry.medications && entry.medications.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[#666]">
                              Medications
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.medications.map((m, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs border-[#EAEAEA] text-[#666]"
                                >
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </Button>
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(entry)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
