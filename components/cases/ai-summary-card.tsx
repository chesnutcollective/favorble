"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { summarizeCase } from "@/app/actions/ai";
import { toast } from "sonner";

type AiSummaryCardProps = {
  caseId: string;
  /**
   * Persisted summary text. Null when no summary has ever been generated for
   * this case, in which case we render a compact "generate" placeholder.
   */
  initialSummary: string | null;
  /** ISO string; used to compute the "Updated X days ago" label. */
  initialGeneratedAt: string | null;
  /** True if `initialGeneratedAt` is older than 14 days. */
  isStale: boolean;
};

const STALE_DAYS = 14;

function formatAge(isoDate: string): string {
  const generated = new Date(isoDate);
  if (Number.isNaN(generated.getTime())) return "";
  const ms = Date.now() - generated.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const hours = Math.max(1, Math.floor(ms / (1000 * 60 * 60)));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/**
 * Hero-styled AI Summary card pinned to the top of the case overview.
 *
 * Renders in three states:
 *   1. Fresh summary (<14d) — show text with a subtle "regenerate" action.
 *   2. Stale summary (>=14d) — same text but flagged as stale with a
 *      foregrounded regenerate button.
 *   3. Empty — compact placeholder with a single "Generate summary" CTA.
 */
export function AiSummaryCard({
  caseId,
  initialSummary,
  initialGeneratedAt,
  isStale,
}: AiSummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [generatedAt, setGeneratedAt] = useState<string | null>(
    initialGeneratedAt,
  );
  const [stale, setStale] = useState<boolean>(isStale);
  const [isPending, startTransition] = useTransition();

  const handleRegenerate = () => {
    startTransition(async () => {
      try {
        const result = await summarizeCase(caseId);
        if (!result) {
          toast.error("AI summary generation returned an empty response.");
          return;
        }
        setSummary(result);
        setGeneratedAt(new Date().toISOString());
        setStale(false);
        toast.success("Case summary updated.");
      } catch {
        toast.error("Failed to generate case summary. Please try again.");
      }
    });
  };

  // Empty placeholder state
  if (!summary) {
    return (
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
              AI
            </span>
            <div>
              <p
                className="text-base font-semibold text-foreground"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                AI Case Summary
              </p>
              <p className="text-sm text-muted-foreground">
                Generate a one-paragraph overview of this case&apos;s status,
                open work, and recent activity.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleRegenerate}
            disabled={isPending}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isPending ? "Generating..." : "Generate summary"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        stale
          ? "border-amber-200 bg-gradient-to-br from-amber-50/50 to-white"
          : "border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white"
      }
    >
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={
                stale
                  ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500 text-xs font-bold text-white"
                  : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white"
              }
            >
              AI
            </span>
            <div>
              <p
                className="text-base font-semibold leading-tight text-foreground"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                AI Case Summary
              </p>
              {generatedAt && (
                <p className="text-xs text-muted-foreground">
                  {stale ? "Stale — " : "Updated "}
                  {formatAge(generatedAt)}
                  {stale && ` (over ${STALE_DAYS} days old)`}
                </p>
              )}
            </div>
          </div>
          <Button
            variant={stale ? "default" : "outline"}
            size="sm"
            onClick={handleRegenerate}
            disabled={isPending}
            className={
              stale
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : undefined
            }
          >
            {isPending ? "Regenerating..." : "Regenerate"}
          </Button>
        </div>
        <p
          className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground"
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
        >
          {summary}
        </p>
      </CardContent>
    </Card>
  );
}
