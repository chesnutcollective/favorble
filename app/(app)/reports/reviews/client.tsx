"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ReviewVolumeChart,
  type ReviewVolumePoint,
} from "@/components/charts/review-volume-chart";
import {
  sendReviewRequest,
  type RecentReview,
  type ReviewCandidate,
  type ReviewRequestChannel,
} from "@/app/actions/google-reviews";

export function ReviewsReportClient({
  recent,
  candidates,
}: {
  recent: RecentReview[];
  candidates: ReviewCandidate[];
}) {
  // 30-day volume+rating series is computed on the client from the recent
  // reviews we already have. When the integration is connected we'll pull a
  // richer, server-aggregated series; this is good enough for the stub.
  const chartData = useMemo<ReviewVolumePoint[]>(() => {
    if (recent.length === 0) return [];
    const bucket = new Map<string, { sum: number; count: number }>();
    for (const r of recent) {
      const day = r.postedAt.slice(0, 10);
      const entry = bucket.get(day) ?? { sum: 0, count: 0 };
      entry.sum += r.rating;
      entry.count += 1;
      bucket.set(day, entry);
    }
    return Array.from(bucket.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, { sum, count }]) => ({
        date,
        count,
        avgRating: sum / count,
      }));
  }, [recent]);

  return (
    <div className="space-y-6">
      {/* Volume / rating chart */}
      <Card className="border-[#EAEAEA]">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
              Review volume &amp; rating (30 days)
            </h3>
            <span className="text-[11px] text-[#8b8b97]">
              Count on left axis, rating on right
            </span>
          </div>
          <ReviewVolumeChart data={chartData} />
        </CardContent>
      </Card>

      {/* Recent reviews list */}
      <Card className="border-[#EAEAEA]">
        <CardContent className="p-5">
          <div className="mb-3">
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
              Recent reviews
            </h3>
            <p className="text-[12px] text-[#666] mt-0.5">
              Newest Google reviews matched to this organization.
            </p>
          </div>
          {recent.length === 0 ? (
            <EmptyRow label="No reviews yet — connect the integration to populate." />
          ) : (
            <ul className="divide-y divide-[#EAEAEA]">
              {recent.map((r) => (
                <li key={r.id} className="py-3 flex items-start gap-4">
                  <Stars value={r.rating} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-[#1a1a1a]">
                        {r.reviewerName ?? "Anonymous"}
                      </span>
                      <span className="text-[11px] text-[#8b8b97] font-mono">
                        {formatDate(r.postedAt)}
                      </span>
                      {r.respondedAt ? (
                        <span className="text-[10px] uppercase tracking-wider text-[#1d72b8]">
                          Responded
                        </span>
                      ) : null}
                    </div>
                    {r.comment ? (
                      <p className="text-[13px] text-[#52525e] mt-1 leading-snug">
                        {r.comment}
                      </p>
                    ) : (
                      <p className="text-[12px] text-[#8b8b97] mt-1 italic">
                        (No comment)
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toast.info("Requires connected integration", {
                        description:
                          "Responses post back to Google once the OAuth flow is connected.",
                      })
                    }
                  >
                    Respond
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Review request candidates */}
      <Card className="border-[#EAEAEA]">
        <CardContent className="p-5">
          <div className="mb-3">
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
              Review request targets
            </h3>
            <p className="text-[12px] text-[#666] mt-0.5">
              Top 10 recently closed-won cases — good candidates for a review
              ask.
            </p>
          </div>
          {candidates.length === 0 ? (
            <EmptyRow label="No closed-won cases yet." />
          ) : (
            <ul className="divide-y divide-[#EAEAEA]">
              {candidates.map((c) => (
                <CandidateRow key={c.caseId} candidate={c} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: ReviewCandidate }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const preferredChannel: ReviewRequestChannel = candidate.contactEmail
    ? "email"
    : candidate.contactPhone
      ? "sms"
      : "in_portal";

  function onSend() {
    startTransition(async () => {
      const result = await sendReviewRequest(candidate.caseId, preferredChannel);
      if (!result.ok) {
        toast.error("Could not log review request", {
          description: result.error,
        });
        return;
      }
      setSent(true);
      toast.success("Request logged", {
        description: "Will send when integration connects.",
      });
    });
  }

  return (
    <li className="py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-[#1a1a1a]">
            {candidate.caseNumber}
          </span>
          {candidate.contactName ? (
            <span className="text-[12px] text-[#666]">
              · {candidate.contactName}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#8b8b97] font-mono">
          {candidate.closedAt ? (
            <span>Closed {formatDate(candidate.closedAt)}</span>
          ) : null}
          <span className="uppercase tracking-wider">
            via {preferredChannel.replace("_", " ")}
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending || sent}
        onClick={onSend}
      >
        {sent ? "Logged" : isPending ? "Sending…" : "Send request"}
      </Button>
    </li>
  );
}

function Stars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div
      className="flex items-center gap-0.5 text-[13px] leading-none"
      aria-label={`${clamped} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={i < clamped ? "text-[#cf8a00]" : "text-[#EAEAEA]"}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-[12px] text-[#8b8b97]">{label}</div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
