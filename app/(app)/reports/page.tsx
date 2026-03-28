import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getCasesByStageReport,
  getTaskCompletionStats,
  getCaseStatusSummary,
  filterReportsByDateRange,
} from "@/app/actions/reports";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent } from "@/components/ui/card";
import { ReportsChartsClient } from "@/components/charts/reports-charts-client";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  await requireSession();

  let stageReport: Awaited<ReturnType<typeof getCasesByStageReport>> = [];
  let taskStats: Awaited<ReturnType<typeof getTaskCompletionStats>> = {
    total: 0,
    completed: 0,
    overdue: 0,
  };
  let statusSummary: Awaited<ReturnType<typeof getCaseStatusSummary>> = {};

  try {
    [stageReport, taskStats, statusSummary] = await Promise.all([
      getCasesByStageReport(),
      getTaskCompletionStats(),
      getCaseStatusSummary(),
    ]);
  } catch {
    // DB unavailable
  }

  const activeCases = statusSummary["active"] ?? 0;
  const closedWon = statusSummary["closed_won"] ?? 0;
  const completionRate =
    taskStats.total > 0
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;

  // Flatten stage report for the client component
  const flatStageReport = stageReport.map((r) => ({
    stageName: r.stageName,
    stageCode: r.stageCode,
    stageGroupName: r.stageGroupName,
    stageGroupColor: r.stageGroupColor,
    caseCount: r.caseCount,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Pre-built reports and analytics for your practice."
      />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Active Cases" value={activeCases} />
        <StatsCard title="Cases Won" value={closedWon} />
        <StatsCard
          title="Task Completion"
          value={`${completionRate}%`}
          subtitle={`${taskStats.completed} of ${taskStats.total} tasks`}
        />
        <StatsCard
          title="Overdue Tasks"
          value={taskStats.overdue}
          subtitle={taskStats.overdue > 0 ? "Need attention" : "All caught up"}
        />
      </div>

      {/* Charts with date range filter and CSV export */}
      <ReportsChartsClient
        stageReport={flatStageReport}
        taskStats={taskStats}
        onDateRangeChange={filterReportsByDateRange}
      />

      {/* Case Status Breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">
            Case Status Breakdown
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(statusSummary).map(([status, count]) => (
              <div
                key={status}
                className="rounded-md border border-border p-3 text-center"
              >
                <p className="text-2xl font-semibold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {status.replace(/_/g, " ")}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
