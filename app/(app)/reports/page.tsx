import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getCasesByStageReport,
  getTaskCompletionStats,
  getCaseStatusSummary,
} from "@/app/actions/reports";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  await requireSession();

  const [stageReport, taskStats, statusSummary] = await Promise.all([
    getCasesByStageReport(),
    getTaskCompletionStats(),
    getCaseStatusSummary(),
  ]);

  const activeCases = statusSummary["active"] ?? 0;
  const closedWon = statusSummary["closed_won"] ?? 0;
  const completionRate =
    taskStats.total > 0
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;

  // Group stages by stage group for the funnel
  const stageGroups = new Map<
    string,
    {
      name: string;
      color: string | null;
      stages: Array<{
        name: string;
        code: string;
        count: number;
      }>;
      totalCases: number;
    }
  >();

  for (const row of stageReport) {
    const group = stageGroups.get(row.stageGroupName) ?? {
      name: row.stageGroupName,
      color: row.stageGroupColor,
      stages: [],
      totalCases: 0,
    };
    group.stages.push({
      name: row.stageName,
      code: row.stageCode,
      count: row.caseCount,
    });
    group.totalCases += row.caseCount;
    stageGroups.set(row.stageGroupName, group);
  }

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

      {/* Cases by Stage */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">Cases by Stage</h3>
          <div className="space-y-6">
            {Array.from(stageGroups.values()).map((group) => (
              <div key={group.name}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: group.color ?? "#6B7280" }}
                  />
                  <h4 className="text-sm font-medium text-gray-700">
                    {group.name}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {group.totalCases}
                  </Badge>
                </div>
                <div className="space-y-1.5 pl-5">
                  {group.stages.map((stage) => (
                    <div
                      key={stage.code}
                      className="flex items-center gap-3"
                    >
                      <span className="text-xs text-gray-500 w-8 font-mono">
                        {stage.code}
                      </span>
                      <span className="text-sm text-gray-700 flex-1">
                        {stage.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              backgroundColor: group.color ?? "#6B7280",
                              width: `${
                                activeCases > 0
                                  ? Math.max(
                                      2,
                                      (stage.count / activeCases) * 100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-8 text-right font-mono">
                          {stage.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Case Status Breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            Case Status Breakdown
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(statusSummary).map(([status, count]) => (
              <div
                key={status}
                className="rounded-md border border-gray-200 p-3 text-center"
              >
                <p className="text-2xl font-semibold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 capitalize">
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
