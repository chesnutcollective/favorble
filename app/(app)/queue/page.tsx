import type { Metadata } from "next";
import {
  getMyQueue,
  getQueueCounts,
  getTeamQueue,
  getOrgUsers,
  getCaseStagesForFilter,
} from "@/app/actions/tasks";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { QueueClient } from "./client";

export const metadata: Metadata = {
  title: "My Queue",
};

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: initialTab } = await searchParams;
  const session = await requireSession();
  const isManager = session.role === "admin" || session.role === "case_manager";

  let tasks: Awaited<ReturnType<typeof getMyQueue>> = [];
  let counts: Awaited<ReturnType<typeof getQueueCounts>> = {
    all: 0,
    overdue: 0,
    today: 0,
    thisWeek: 0,
    nextWeek: 0,
    noDate: 0,
  };
  let teamTasks: Awaited<ReturnType<typeof getTeamQueue>> = [];
  let orgUsers: Awaited<ReturnType<typeof getOrgUsers>> = [];
  let caseStages: Awaited<ReturnType<typeof getCaseStagesForFilter>> = [];

  try {
    const promises: Promise<unknown>[] = [
      getMyQueue(),
      getQueueCounts(),
      getOrgUsers(),
      getCaseStagesForFilter(),
    ];
    if (isManager) {
      promises.push(getTeamQueue());
    }
    const results = await Promise.all(promises);
    tasks = results[0] as Awaited<ReturnType<typeof getMyQueue>>;
    counts = results[1] as Awaited<ReturnType<typeof getQueueCounts>>;
    orgUsers = results[2] as Awaited<ReturnType<typeof getOrgUsers>>;
    caseStages = results[3] as Awaited<
      ReturnType<typeof getCaseStagesForFilter>
    >;
    if (isManager) {
      teamTasks = results[4] as Awaited<ReturnType<typeof getTeamQueue>>;
    }
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Queue"
        description="Your assigned tasks and work items."
      />
      <QueueClient
        initialTasks={tasks.map((t) => ({
          ...t,
          dueDate: t.dueDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
        counts={counts}
        isManager={isManager}
        teamTasks={teamTasks.map((t) => ({
          ...t,
          dueDate: t.dueDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          assignedToId: t.assignedToId ?? "",
          assigneeName: t.assigneeName ?? "Unassigned",
        }))}
        orgUsers={orgUsers}
        caseStages={caseStages}
        initialTab={initialTab}
      />
    </div>
  );
}
