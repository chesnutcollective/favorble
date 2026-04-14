"use client";

/**
 * D4 — Stage Checklist card.
 *
 * Rendered on /cases/[id]/overview above the Parties section. Shows the
 * required/optional checklist items declared on the current stage, a
 * progress ring ("3 of 5 required complete"), and a checkbox list bound to
 * the `toggleChecklistItem` server action. Required items block stage
 * advance via `changeCaseStage`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toggleChecklistItem } from "@/app/actions/cases";
import { cn } from "@/lib/utils";

const BRAND_INDIGO = "#263c94";

export type StageChecklistItem = {
  key: string;
  label: string;
  required: boolean;
  status: "pending" | "done" | "skipped";
};

type StageChecklistCardProps = {
  caseId: string;
  stageId: string;
  stageName: string;
  items: StageChecklistItem[];
  requiredTotal: number;
  requiredDone: number;
};

export function StageChecklistCard({
  caseId,
  stageId,
  stageName,
  items,
  requiredTotal,
  requiredDone,
}: StageChecklistCardProps) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Optimistic local view of statuses so checkboxes feel instant.
  const [localItems, setLocalItems] = useState(items);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stage Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No checklist items are defined for the
            <span className="mx-1 font-medium text-foreground">
              {stageName}
            </span>
            stage.
          </p>
        </CardContent>
      </Card>
    );
  }

  const requiredPct =
    requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100);
  const ready = requiredDone === requiredTotal;

  function handleToggle(item: StageChecklistItem, checked: boolean) {
    const nextStatus = checked ? "done" : "pending";
    // Optimistic update.
    setLocalItems((prev) =>
      prev.map((i) => (i.key === item.key ? { ...i, status: nextStatus } : i)),
    );
    setPendingKey(item.key);
    startTransition(async () => {
      try {
        const result = await toggleChecklistItem(
          caseId,
          stageId,
          item.key,
          checked,
        );
        if (!result.ok) {
          toast.error(result.error);
          // Roll back on failure.
          setLocalItems((prev) =>
            prev.map((i) =>
              i.key === item.key ? { ...i, status: item.status } : i,
            ),
          );
        } else {
          router.refresh();
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to update checklist";
        toast.error(msg);
        setLocalItems((prev) =>
          prev.map((i) =>
            i.key === item.key ? { ...i, status: item.status } : i,
          ),
        );
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Stage Checklist</CardTitle>
          <div className="flex items-center gap-2">
            <ProgressRing percent={requiredPct} />
            <span className="text-xs text-muted-foreground">
              <span
                className="font-semibold text-foreground"
                aria-live="polite"
              >
                {requiredDone} of {requiredTotal}
              </span>{" "}
              required complete
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Stage: <span className="font-medium text-foreground">{stageName}</span>
          {ready ? (
            <Badge
              className="ml-2 bg-indigo-100 text-[10px] uppercase tracking-wide text-indigo-900 hover:bg-indigo-100"
              variant="secondary"
            >
              Ready to advance
            </Badge>
          ) : requiredTotal > 0 ? (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] uppercase tracking-wide"
            >
              Advance blocked
            </Badge>
          ) : null}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {localItems.map((item) => {
            const isDone = item.status === "done";
            const isRowPending = pendingKey === item.key && isPending;
            return (
              <li
                key={item.key}
                className="flex items-center justify-between gap-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-3 min-w-0">
                  <Checkbox
                    checked={isDone}
                    disabled={isRowPending}
                    onCheckedChange={(checked) =>
                      handleToggle(item, checked === true)
                    }
                    aria-label={item.label}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      isDone && "text-muted-foreground line-through",
                    )}
                  >
                    {item.label}
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-2">
                  {item.required ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      Required
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      Optional
                    </Badge>
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

/**
 * Minimal SVG progress ring. Filled in brand indigo; muted zinc track.
 * Not exported — only used by this card.
 */
function ProgressRing({ percent }: { percent: number }) {
  const size = 28;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E4E4E7"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={BRAND_INDIGO}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
