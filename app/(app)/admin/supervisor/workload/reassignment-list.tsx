"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/design-tokens";
import { reassignTask } from "@/app/actions/tasks";
import type { ReassignmentSuggestion } from "@/lib/services/workload-imbalance";

type AppliedState = "idle" | "applying" | "applied" | "error";

export function ReassignmentList({
  suggestions,
  canReassign,
}: {
  suggestions: ReassignmentSuggestion[];
  canReassign: boolean;
}) {
  const [states, setStates] = useState<Record<string, AppliedState>>({});
  const [isPending, startTransition] = useTransition();

  function handleApply(s: ReassignmentSuggestion) {
    if (!canReassign) return;
    setStates((prev) => ({ ...prev, [s.taskId]: "applying" }));
    startTransition(async () => {
      try {
        await reassignTask(s.taskId, s.toUserId);
        setStates((prev) => ({ ...prev, [s.taskId]: "applied" }));
      } catch {
        setStates((prev) => ({ ...prev, [s.taskId]: "error" }));
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div
          className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] border-b"
          style={{
            color: COLORS.text2,
            borderColor: COLORS.borderDefault,
          }}
        >
          Recommended reassignments
        </div>
        <ul className="divide-y" style={{ borderColor: COLORS.borderSubtle }}>
          {suggestions.map((s) => {
            const state = states[s.taskId] ?? "idle";
            return (
              <li
                key={s.taskId}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: COLORS.text1 }}
                  >
                    {s.taskTitle}
                  </p>
                  <p
                    className="text-[12px] mt-0.5"
                    style={{ color: COLORS.text2 }}
                  >
                    Move from{" "}
                    <span style={{ color: COLORS.text1 }}>{s.fromUserName}</span>{" "}
                    → <span style={{ color: COLORS.text1 }}>{s.toUserName}</span>
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: COLORS.text3 }}
                  >
                    {s.reason}
                    {s.dueDate && ` · due ${new Date(s.dueDate).toLocaleDateString()}`}
                  </p>
                  {s.rationale && (
                    <p
                      className="text-[11px] mt-1 leading-relaxed"
                      style={{ color: COLORS.text2 }}
                    >
                      {s.rationale}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {state === "applied" ? (
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: COLORS.ok }}
                    >
                      Applied
                    </span>
                  ) : state === "error" ? (
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: COLORS.bad }}
                    >
                      Failed
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canReassign || isPending || state === "applying"}
                      onClick={() => handleApply(s)}
                    >
                      {state === "applying" ? "Applying…" : "Apply"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
