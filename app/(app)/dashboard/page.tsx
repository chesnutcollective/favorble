import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getActiveCaseCount, getCaseCountsByStage } from "@/app/actions/cases";
import {
  getTasksDueTodayCount,
  getOverdueTaskCount,
  getMyQueue,
} from "@/app/actions/tasks";
import { getRecentAuditLog, getUpcomingDeadlines } from "@/app/actions/reports";
import { StatsCard } from "@/components/shared/stats-card";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CasesByStageBarChart } from "@/components/charts/cases-by-stage-bar-chart";
import { PipelineFunnelChart } from "@/components/charts/pipeline-funnel-chart";
import { ActivityFeed } from "@/components/charts/activity-feed";
import { UpcomingDeadlines } from "@/components/charts/upcoming-deadlines";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  await requireSession();

  let activeCases = 0;
  let tasksDueToday = 0;
  let overdueTaskCount = 0;
  let stageBreakdown: Awaited<ReturnType<typeof getCaseCountsByStage>> = [];
  let myTasks: Awaited<ReturnType<typeof getMyQueue>> = [];
  let auditEntries: Awaited<ReturnType<typeof getRecentAuditLog>> = [];
  let upcomingDeadlines: Awaited<ReturnType<typeof getUpcomingDeadlines>> = [];

  try {
    [
      activeCases,
      tasksDueToday,
      overdueTaskCount,
      stageBreakdown,
      myTasks,
      auditEntries,
      upcomingDeadlines,
    ] = await Promise.all([
      getActiveCaseCount(),
      getTasksDueTodayCount(),
      getOverdueTaskCount(),
      getCaseCountsByStage(),
      getMyQueue({ dueDateRange: "today" }),
      getRecentAuditLog(10),
      getUpcomingDeadlines(5),
    ]);
  } catch {
    // DB unavailable — show empty dashboard
  }

  // Group stage counts by stage group
  const groupedStages = new Map<
    string,
    { name: string; color: string | null; count: number }
  >();
  for (const s of stageBreakdown) {
    const existing = groupedStages.get(s.stageGroupName);
    if (existing) {
      existing.count += s.count;
    } else {
      groupedStages.set(s.stageGroupName, {
        name: s.stageGroupName,
        color: s.stageGroupColor,
        count: s.count,
      });
    }
  }

  const chartData = Array.from(groupedStages.values());
  const funnelData = chartData.filter((d) => d.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button variant="secondary" size="sm">
              Export
            </Button>
            <Link href="/cases/new">
              <Button size="sm">+ New Case</Button>
            </Link>
          </>
        }
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Active Cases" value={activeCases} />
        <StatsCard
          title="Tasks Due Today"
          value={tasksDueToday}
          subtitle={
            overdueTaskCount > 0 ? `+${overdueTaskCount} overdue` : undefined
          }
          subtitleVariant={overdueTaskCount > 0 ? "danger" : "default"}
        />
        <StatsCard title="Stage Groups" value={groupedStages.size} />
        <StatsCard title="Pipeline Stages" value={stageBreakdown.length} />
      </div>

      {/* Pipeline Funnel — section header outside the card */}
      {funnelData.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">
              Pipeline Funnel
            </h2>
            <Link
              href="/cases"
              className="text-[13px] font-medium text-[#666] hover:text-[#171717] transition-colors duration-200"
            >
              View All
            </Link>
          </div>
          <Card>
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#666] mb-3">
                Cases by Stage Group
              </div>
              <PipelineFunnelChart data={funnelData} />
            </div>
          </Card>
        </div>
      )}

      {/* Two-column bottom grid: Tasks + Cases by Stage */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* My Tasks */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">
              My Tasks
            </h2>
            <Link
              href="/queue"
              className="text-[13px] font-medium text-[#666] hover:text-[#171717] transition-colors duration-200"
            >
              View All
            </Link>
          </div>
          <Card>
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#666] mb-3">
                Upcoming Tasks
              </div>
              {myTasks.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[13px] text-[#666]">
                    No tasks due today
                  </p>
                </div>
              ) : (
                <ul className="list-none">
                  {myTasks.slice(0, 6).map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 py-3 border-b border-[#EAEAEA] last:border-b-0 text-[13px]"
                    >
                      <Checkbox className="h-4 w-4 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-[#171717]">
                        {task.title}
                        {task.caseNumber && (
                          <>
                            {" \u2014 "}
                            <Link
                              href={`/cases/${task.caseId}`}
                              className="text-[#666] hover:underline"
                            >
                              {task.caseNumber}
                            </Link>
                          </>
                        )}
                      </span>
                      {task.dueDate && (
                        <span
                          className={`text-[11px] font-mono shrink-0 ${
                            new Date(task.dueDate) < new Date()
                              ? "text-[#EE0000]"
                              : "text-[#666]"
                          }`}
                        >
                          {new Date(task.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      {task.priority === "urgent" ||
                      task.priority === "high" ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0 border-[#EE0000] text-[#EE0000] uppercase tracking-[0.04em] px-1 py-0"
                        >
                          {task.priority}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Cases by Stage */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">
              Cases by Stage
            </h2>
            <Link
              href="/cases"
              className="text-[13px] font-medium text-[#666] hover:text-[#171717] transition-colors duration-200"
            >
              View All
            </Link>
          </div>
          <Card>
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#666] mb-3">
                Stage Distribution
              </div>
              <CasesByStageBarChart data={chartData} />
            </div>
          </Card>
        </div>
      </div>

      {/* Two-column bottom grid: Upcoming Deadlines + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming Deadlines */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">
              Upcoming Deadlines
            </h2>
            <Link
              href="/calendar"
              className="text-[13px] font-medium text-[#666] hover:text-[#171717] transition-colors duration-200"
            >
              View Calendar
            </Link>
          </div>
          <Card>
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#666] mb-3">
                Upcoming Deadlines
              </div>
              <UpcomingDeadlines events={upcomingDeadlines} />
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">
              Recent Activity
            </h2>
            <Link
              href="/queue"
              className="text-[13px] font-medium text-[#666] hover:text-[#171717] transition-colors duration-200"
            >
              View All
            </Link>
          </div>
          <Card>
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#666] mb-3">
                Recent Activity
              </div>
              <ActivityFeed entries={auditEntries} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
