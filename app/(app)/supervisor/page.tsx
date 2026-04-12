import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  getTeamWorkload,
  getEscalationQueue,
  getSupervisorEvents,
  getPerformanceSummary,
  type WorkloadRow,
  type EscalationRow,
  type SupervisorEventWorkspace,
  type PerformanceSummary,
} from "@/app/actions/supervisor";
import { SupervisorTabs } from "./tabs-client";

export const metadata: Metadata = { title: "Supervisor Overview" };
export const dynamic = "force-dynamic";

const EMPTY_EVENTS: SupervisorEventWorkspace = {
  active: [],
  resolved: [],
  counts: {
    detected: 0,
    inProgress: 0,
    awaitingReview: 0,
    resolved: 0,
  },
};

const EMPTY_PERF: PerformanceSummary = {
  totalActiveCases: 0,
  totalOpenTasks: 0,
  totalOverdueTasks: 0,
  totalEscalations: 0,
  totalActiveEvents: 0,
  avgTasksPerUser: 0,
};

export default async function SupervisorPage() {
  await requireSession();

  let workload: WorkloadRow[] = [];
  let escalations: EscalationRow[] = [];
  let events: SupervisorEventWorkspace = EMPTY_EVENTS;
  let perf: PerformanceSummary = EMPTY_PERF;

  try {
    [workload, escalations, events, perf] = await Promise.all([
      getTeamWorkload(),
      getEscalationQueue(),
      getSupervisorEvents(),
      getPerformanceSummary(),
    ]);
  } catch {
    // DB unavailable -- render empty workspace.
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisor Overview"
        description="Team workload, escalations, and supervisor event feed across all active cases."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Active Cases"
          value={perf.totalActiveCases}
          subtitle="Org-wide"
        />
        <StatsCard
          title="Open Tasks"
          value={perf.totalOpenTasks}
          subtitle={`${perf.avgTasksPerUser} avg per user`}
        />
        <StatsCard
          title="Overdue"
          value={perf.totalOverdueTasks}
          subtitle="Past due date"
          subtitleVariant={perf.totalOverdueTasks > 0 ? "danger" : "default"}
        />
        <StatsCard
          title="Escalations"
          value={perf.totalEscalations}
          subtitle="Needs attention"
          subtitleVariant={perf.totalEscalations > 0 ? "danger" : "default"}
        />
        <StatsCard
          title="Active Events"
          value={perf.totalActiveEvents}
          subtitle={`${events.counts.detected} detected, ${events.counts.awaitingReview} awaiting review`}
        />
      </div>

      <SupervisorTabs
        workload={workload}
        escalations={escalations}
        events={events}
      />
    </div>
  );
}
