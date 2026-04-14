import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getGoogleReviewsConnection,
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
  let connection: Awaited<
    ReturnType<typeof getGoogleReviewsConnection>
  > | null = null;

  try {
    const [o, r, c, conn] = await Promise.all([
      getReviewsOverview(30),
      listRecentReviews(10),
      listReviewCandidates(10),
      getGoogleReviewsConnection(),
    ]);
    overview = o;
    recent = r;
    candidates = c;
    connection = conn;
  } catch {
    // DB unavailable — render empty state below
  }

  const hasAnyData = overview.currentCount > 0 || recent.length > 0;
  const activationSubtitle = hasAnyData ? undefined : "Connect to activate";
  const avgRatingDisplay = hasAnyData ? overview.avgRating.toFixed(1) : "—";

  const syncBanner = buildSyncBanner(connection);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Reviews"
        description="Reputation tracking and review-request opportunities from closed-won cases."
      />

      {syncBanner ? (
        <div className="rounded-md border border-[#EAEAEA] bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#52525e]">
          {syncBanner}
        </div>
      ) : null}

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

function buildSyncBanner(
  connection: Awaited<ReturnType<typeof getGoogleReviewsConnection>> | null,
): string | null {
  if (!connection) return null;
  if (!connection.isConnected) {
    return "Google Business Profile is not connected — connect from the admin integrations page to populate this report.";
  }
  if (!connection.lastSyncAt) {
    return "Connected but not synced yet. Tap Refresh on the admin page, or wait for the nightly sync.";
  }
  const mins = Math.round(
    (Date.now() - new Date(connection.lastSyncAt).getTime()) / 60000,
  );
  if (mins < 1) return "Last synced just now.";
  if (mins < 60)
    return `Last synced ${mins} minute${mins === 1 ? "" : "s"} ago.`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Last synced ${hrs} hour${hrs === 1 ? "" : "s"} ago.`;
  const days = Math.round(hrs / 24);
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago.`;
}
