import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getFilingQueue,
  getFilingMetrics,
  getFilingTemplates,
  type FilingQueueRow,
} from "@/app/actions/filing";
import { FilingClient } from "./client";

export const metadata: Metadata = {
  title: "Filing Queue",
};

// Always fresh -- filing agents need up-to-the-second state.
export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function FilingPage() {
  let queue: FilingQueueRow[] = [];
  let metrics = {
    readyToFile: 0,
    inProgress: 0,
    submittedToday: 0,
    dueThisWeek: 0,
  };
  let templates: Awaited<ReturnType<typeof getFilingTemplates>> = [];

  try {
    // Parallelize all three reads. Each is index-optimized.
    const [q, m, t] = await Promise.all([
      getFilingQueue("all"),
      getFilingMetrics(),
      getFilingTemplates(),
    ]);
    queue = q;
    metrics = m;
    templates = t;
  } catch {
    // DB unavailable — render empty workspace so the page still hydrates fast.
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Filing Queue"
        description="Prepare and submit SSA applications with one click."
      />
      <FilingClient
        initialQueue={queue}
        metrics={metrics}
        templates={templates}
      />
    </div>
  );
}
