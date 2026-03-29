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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CasesByStageBarChart } from "@/components/charts/cases-by-stage-bar-chart";
import { PipelineFunnelChart } from "@/components/charts/pipeline-funnel-chart";
import { ActivityFeed } from "@/components/charts/activity-feed";
import { UpcomingDeadlines } from "@/components/charts/upcoming-deadlines";
import {
  Briefcase01Icon,
  Task01Icon,
  Layers01Icon,
  GitBranchIcon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireSession();

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
        description={`Welcome back, ${user.firstName}.`}
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Cases"
          value={activeCases}
          icon={Briefcase01Icon}
          iconBgClass="bg-blue-50"
          iconColor="rgb(59 130 246)"
          accentClass="border-l-blue-500"
        />
        <StatsCard
          title="Tasks Due Today"
          value={tasksDueToday}
          subtitle={
            overdueTaskCount > 0 ? `${overdueTaskCount} overdue` : undefined
          }
          subtitleVariant={overdueTaskCount > 0 ? "danger" : "default"}
          icon={Task01Icon}
          iconBgClass="bg-amber-50"
          iconColor="rgb(245 158 11)"
          accentClass="border-l-amber-500"
        />
        <StatsCard
          title="Stage Groups"
          value={groupedStages.size}
          icon={Layers01Icon}
          iconBgClass="bg-emerald-50"
          iconColor="rgb(16 185 129)"
          accentClass="border-l-emerald-500"
        />
        <StatsCard
          title="Pipeline Stages"
          value={stageBreakdown.length}
          icon={GitBranchIcon}
          iconBgClass="bg-violet-50"
          iconColor="rgb(139 92 246)"
          accentClass="border-l-violet-500"
        />
      </div>

      {/* Pipeline Funnel */}
      {funnelData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineFunnelChart data={funnelData} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Tasks Due Today */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Tasks (Due Today)</CardTitle>
              <Link
                href="/queue"
                className="text-sm text-primary hover:underline"
              >
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-6 text-center"
                style={{ animation: "emptyStateIn 0.3s ease-out" }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(43,138,62,0.08)]">
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={20}
                    className="text-[#2b8a3e]"
                  />
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">
                  You're all caught up!
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No tasks due today
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {myTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-md p-2 hover:bg-accent"
                  >
                    <Checkbox className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Link
                          href={`/cases/${task.caseId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {task.caseNumber}
                        </Link>
                        {task.stageName && (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{
                              borderColor: task.stageGroupColor ?? undefined,
                              color: task.stageGroupColor ?? undefined,
                            }}
                          >
                            {task.stageName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {task.priority === "urgent" || task.priority === "high" ? (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        {task.priority}
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cases by Stage Group — Recharts BarChart */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Cases by Stage</CardTitle>
              <Link
                href="/cases"
                className="text-sm text-primary hover:underline"
              >
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <CasesByStageBarChart data={chartData} />
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Deadlines */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            <Link
              href="/calendar"
              className="text-sm text-primary hover:underline"
            >
              View Calendar
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <UpcomingDeadlines events={upcomingDeadlines} />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed entries={auditEntries} />
        </CardContent>
      </Card>
    </div>
  );
}
