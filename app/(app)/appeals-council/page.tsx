import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  getAppealsCouncilBriefs,
  type AcBriefWorkspace,
} from "@/app/actions/appeals-council";
import { AppealsCouncilTabs } from "./tabs-client";

export const metadata: Metadata = { title: "Appeals Council" };
export const dynamic = "force-dynamic";

const EMPTY: AcBriefWorkspace = {
  pending: [],
  drafting: [],
  inReview: [],
  filed: [],
  decided: [],
  counts: {
    pending: 0,
    drafting: 0,
    inReview: 0,
    filed: 0,
    decided: 0,
  },
};

function urgentCount(data: AcBriefWorkspace): number {
  const active = [...data.pending, ...data.drafting, ...data.inReview];
  return active.filter(
    (r) => r.daysRemaining !== null && r.daysRemaining <= 7,
  ).length;
}

export default async function AppealsCouncilPage() {
  await requireSession();

  let data: AcBriefWorkspace = EMPTY;
  try {
    data = await getAppealsCouncilBriefs();
  } catch {
    // DB unavailable — render empty workspace.
  }

  const urgent = urgentCount(data);
  const activeTotal =
    data.counts.pending + data.counts.drafting + data.counts.inReview;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appeals Council"
        description="AC brief pipeline — track unfavorable decisions through drafting, review, and filing before the 65-day deadline."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatsCard
          title="Active"
          value={activeTotal}
          subtitle="Not yet filed"
        />
        <StatsCard
          title="Filed"
          value={data.counts.filed}
          subtitle="Awaiting AC decision"
        />
        <StatsCard
          title="Decided"
          value={data.counts.decided}
          subtitle="Granted / denied / remanded"
        />
        <StatsCard
          title="Urgent"
          value={urgent}
          subtitle="Within 7 days of deadline"
          subtitleVariant={urgent > 0 ? "danger" : "default"}
        />
      </div>

      <AppealsCouncilTabs data={data} />
    </div>
  );
}
