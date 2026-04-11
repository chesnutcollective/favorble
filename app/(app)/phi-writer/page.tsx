import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getPhiWriterQueue, getPhiWriters } from "@/app/actions/phi-writer";
import { PhiWriterWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "PHI Sheet Writer",
};

export default async function PhiWriterPage() {
  let queue: Awaited<ReturnType<typeof getPhiWriterQueue>> = {
    rows: [],
    metrics: {
      myAssigned: 0,
      inProgress: 0,
      inReview: 0,
      completedThisWeek: 0,
      unassigned: 0,
      dueWithin14Days: 0,
    },
    currentUserId: "",
  };
  let writers: Awaited<ReturnType<typeof getPhiWriters>> = [];

  try {
    [queue, writers] = await Promise.all([
      getPhiWriterQueue(),
      getPhiWriters(),
    ]);
  } catch {
    // DB unavailable — render empty state
  }

  const serializedRows = queue.rows.map((r) => ({
    ...r,
    hearingDate: r.hearingDate ? r.hearingDate.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="PHI Sheet Writer"
        description="Queue of upcoming hearings needing Pre-Hearing Intelligence sheets, sorted by hearing date."
      />
      <PhiWriterWorkspace
        rows={serializedRows}
        metrics={queue.metrics}
        writers={writers}
        currentUserId={queue.currentUserId}
      />
    </div>
  );
}
