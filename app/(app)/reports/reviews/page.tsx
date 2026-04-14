import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getReviewsOverview,
  listRecentReviews,
  listReviewCandidates,
} from "@/app/actions/google-reviews";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { ReviewsReportClient } from "./client";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export default async function ReviewsReportPage() {
  await requireSession();

  let overview: Awaited<ReturnType<typeof getReviewsOverview>> = {
    startingCount: 0,
    currentCount: 0,
    avgRating: 0,
    requestsSent: 0,
    periodDays: 30,
  };
  let recent: Awaited<ReturnType<typeof listRecentReviews>> = [];
  let candidates: Awaited<ReturnType<typeof listReviewCandidates>> = [];

  try {
    const [o, r, c] = await Promise.all([
      getReviewsOverview(30),
      listRecentReviews(10),
      listReviewCandidates(10),
    ]);
    overview = o;
    recent = r;
    candidates = c;
  } catch {
    // DB unavailable — render empty state below
  }

  const hasAnyData = overview.currentCount > 0 || recent.length > 0;
  const activationSubtitle = hasAnyData ? undefined : "Connect to activate";
  const avgRatingDisplay = hasAnyData ? overview.avgRating.toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Reviews"
        description="Reputation tracking and review-request opportunities from closed-won cases."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Starting review count"
          value={hasAnyData ? overview.startingCount : "—"}
          subtitle={activationSubtitle ?? "Baseline at connect"}
        />
        <StatsCard
          title="Current count"
          value={hasAnyData ? overview.currentCount : "—"}
          subtitle={activationSubtitle ?? "Reviews on file"}
        />
        <StatsCard
          title="Average rating"
          value={avgRatingDisplay}
          subtitle={activationSubtitle ?? "Across all reviews"}
        />
        <StatsCard
          title="Requests sent"
          value={overview.requestsSent}
          subtitle={`Last ${overview.periodDays} days`}
        />
      </div>

      <ReviewsReportClient recent={recent} candidates={candidates} />
    </div>
  );
}
