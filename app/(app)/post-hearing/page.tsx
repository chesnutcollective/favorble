import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  getHearingOutcomes,
  type HearingOutcomeWorkspace,
} from "@/app/actions/post-hearing";
import { PostHearingTabs } from "./tabs-client";

export const metadata: Metadata = { title: "Post-Hearing Processing" };
export const dynamic = "force-dynamic";

const EMPTY: HearingOutcomeWorkspace = {
  awaiting: [],
  clientNotified: [],
  stageAdvanced: [],
  completed: [],
  counts: {
    awaiting: 0,
    clientNotified: 0,
    stageAdvanced: 0,
    completed: 0,
  },
};

export default async function PostHearingPage() {
  await requireSession();

  let data: HearingOutcomeWorkspace = EMPTY;
  try {
    data = await getHearingOutcomes();
  } catch {
    // DB unavailable — render empty workspace.
  }

  const inFlight =
    data.counts.awaiting + data.counts.clientNotified + data.counts.stageAdvanced;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Post-Hearing Processing"
        description="Hearing outcomes awaiting processing — notify clients, advance stages, and close the loop on every decision."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatsCard
          title="Awaiting"
          value={data.counts.awaiting}
          subtitle="Not yet processed"
        />
        <StatsCard
          title="In-flight"
          value={inFlight}
          subtitle="Awaiting → stage advanced"
        />
        <StatsCard
          title="Completed"
          value={data.counts.completed}
          subtitle="Processing closed"
        />
        <StatsCard
          title="Awaiting %"
          value={
            data.counts.awaiting + data.counts.completed === 0
              ? "—"
              : `${Math.round(
                  (data.counts.awaiting /
                    Math.max(
                      1,
                      data.counts.awaiting + data.counts.completed,
                    )) *
                    100,
                )}%`
          }
          subtitle="Of total processing queue"
        />
      </div>

      <PostHearingTabs data={data} />
    </div>
  );
}
