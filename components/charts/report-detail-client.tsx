"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeamMemberBarChart } from "./team-member-bar-chart";
import { TimeInStageChart } from "./time-in-stage-chart";
import { CasesOverTimeChart } from "./cases-over-time-chart";
import { TaskCompletionPieChart } from "./task-completion-pie-chart";
import { PipelineFunnelChart } from "./pipeline-funnel-chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Props = {
  reportType: string;
  initialData: Record<string, unknown>;
  onFilter: (
    reportType: string,
    startDate: string | null,
    endDate: string | null,
  ) => Promise<Record<string, unknown>>;
};

export function ReportDetailClient({
  reportType,
  initialData,
  onFilter,
}: Props) {
  const [data, setData] = useState(initialData);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const showDateFilter = [
    "cases-by-stage",
    "cases-over-time",
    "task-completion",
  ].includes(reportType);

  async function handleFilter() {
    setLoading(true);
    try {
      const result = await onFilter(
        reportType,
        startDate || null,
        endDate || null,
      );
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  function handlePdfExport() {
    window.print();
  }

  function handleCsvExport() {
    const csv = buildCsv(reportType, data);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Filters and export buttons */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            {showDateFilter && (
              <>
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label htmlFor="detail-start-date">From</Label>
                  <Input
                    id="detail-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="space-y-1.5 w-full sm:w-auto">
                  <Label htmlFor="detail-end-date">To</Label>
                  <Input
                    id="detail-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
                <Button onClick={handleFilter} disabled={loading} size="sm">
                  {loading ? "Filtering..." : "Apply Filter"}
                </Button>
              </>
            )}
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
              <Button onClick={handleCsvExport} variant="outline" size="sm">
                Export CSV
              </Button>
              <Button onClick={handlePdfExport} variant="outline" size="sm">
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="p-6">
          <ReportChart reportType={reportType} data={data} />
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Data Table</h3>
          <ReportTable reportType={reportType} data={data} />
        </CardContent>
      </Card>
    </div>
  );
}

function ReportChart({
  reportType,
  data,
}: {
  reportType: string;
  data: Record<string, unknown>;
}) {
  switch (reportType) {
    case "cases-by-stage": {
      const stageReport = (data.stageReport ?? []) as Array<{
        stageName: string;
        stageGroupColor: string | null;
        caseCount: number;
      }>;
      const barData = stageReport.map((row) => ({
        name: row.stageName,
        count: row.caseCount,
        color: row.stageGroupColor ?? "#6B7280",
      }));
      if (barData.length === 0) {
        return (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No stage data
          </p>
        );
      }
      return (
        <ResponsiveContainer
          width="100%"
          height={Math.max(barData.length * 36, 200)}
        >
          <BarChart
            data={barData}
            layout="vertical"
            margin={{ left: 10, right: 20 }}
          >
            <XAxis type="number" allowDecimals={false} fontSize={12} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              fontSize={11}
              tick={{ fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {barData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "team-member": {
      const teamData = (data.teamMember ?? []) as Array<{
        name: string;
        caseCount: number;
      }>;
      return <TeamMemberBarChart data={teamData} />;
    }
    case "time-in-stage": {
      const stageData = (data.timeInStage ?? []) as Array<{
        stageName: string;
        stageGroupColor: string | null;
        avgDays: number;
      }>;
      return <TimeInStageChart data={stageData} />;
    }
    case "cases-over-time": {
      const timeData = (data.casesOverTime ?? []) as Array<{
        period: string;
        opened: number;
        closed: number;
      }>;
      return <CasesOverTimeChart data={timeData} />;
    }
    case "pipeline-funnel": {
      const funnelData = (data.pipelineFunnel ?? []) as Array<{
        name: string;
        color: string | null;
        count: number;
      }>;
      return (
        <div>
          <PipelineFunnelChart data={funnelData} />
          <div className="flex flex-wrap gap-3 mt-3">
            {funnelData.map((segment) => (
              <div key={segment.name} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: segment.color ?? "#6B7280",
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {segment.name} ({segment.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "task-completion": {
      const taskStats = (data.taskStats ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      }) as { total: number; completed: number; overdue: number };
      return <TaskCompletionPieChart data={taskStats} />;
    }
    default:
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Unknown report type
        </p>
      );
  }
}

function ReportTable({
  reportType,
  data,
}: {
  reportType: string;
  data: Record<string, unknown>;
}) {
  switch (reportType) {
    case "cases-by-stage": {
      const rows = (data.stageReport ?? []) as Array<{
        stageName: string;
        stageGroupName: string;
        caseCount: number;
      }>;
      if (rows.length === 0)
        return (
          <p className="text-sm text-muted-foreground">No data available.</p>
        );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Stage
                </th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Stage Group
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Cases
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.stageName}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 text-foreground">{row.stageName}</td>
                  <td className="py-2 pr-4 text-foreground">
                    {row.stageGroupName}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {row.caseCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "team-member": {
      const rows = (data.teamMember ?? []) as Array<{
        name: string;
        caseCount: number;
      }>;
      if (rows.length === 0)
        return (
          <p className="text-sm text-muted-foreground">No data available.</p>
        );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Team Member
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Cases
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 text-foreground">{row.name}</td>
                  <td className="py-2 text-right text-foreground">
                    {row.caseCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "time-in-stage": {
      const rows = (data.timeInStage ?? []) as Array<{
        stageName: string;
        stageGroupName: string;
        avgDays: number;
        transitionCount: number;
      }>;
      if (rows.length === 0)
        return (
          <p className="text-sm text-muted-foreground">No data available.</p>
        );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Stage
                </th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Stage Group
                </th>
                <th className="text-right py-2 pr-4 font-medium text-muted-foreground">
                  Avg Days
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Transitions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.stageName}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 text-foreground">{row.stageName}</td>
                  <td className="py-2 pr-4 text-foreground">
                    {row.stageGroupName}
                  </td>
                  <td className="py-2 pr-4 text-right text-foreground">
                    {row.avgDays}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {row.transitionCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "cases-over-time": {
      const rows = (data.casesOverTime ?? []) as Array<{
        period: string;
        opened: number;
        closed: number;
      }>;
      if (rows.length === 0)
        return (
          <p className="text-sm text-muted-foreground">No data available.</p>
        );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Period
                </th>
                <th className="text-right py-2 pr-4 font-medium text-muted-foreground">
                  Opened
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Closed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.period}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 text-foreground">
                    {formatPeriod(row.period)}
                  </td>
                  <td className="py-2 pr-4 text-right text-foreground">
                    {row.opened}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {row.closed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "pipeline-funnel": {
      const rows = (data.pipelineFunnel ?? []) as Array<{
        name: string;
        count: number;
      }>;
      if (rows.length === 0)
        return (
          <p className="text-sm text-muted-foreground">No data available.</p>
        );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Stage Group
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Cases
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 text-foreground">{row.name}</td>
                  <td className="py-2 text-right text-foreground">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "task-completion": {
      const stats = (data.taskStats ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      }) as { total: number; completed: number; overdue: number };
      const pending = Math.max(
        stats.total - stats.completed - stats.overdue,
        0,
      );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Metric
                </th>
                <th className="text-right py-2 font-medium text-muted-foreground">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 text-foreground">Total Tasks</td>
                <td className="py-2 text-right text-foreground">
                  {stats.total}
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 text-foreground">Completed</td>
                <td className="py-2 text-right text-foreground">
                  {stats.completed}
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 text-foreground">Pending</td>
                <td className="py-2 text-right text-foreground">{pending}</td>
              </tr>
              <tr className="border-b border-border last:border-0">
                <td className="py-2 pr-4 text-foreground">Overdue</td>
                <td className="py-2 text-right text-foreground">
                  {stats.overdue}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return (
        <p className="text-sm text-muted-foreground">Unknown report type.</p>
      );
  }
}

function formatPeriod(period: string): string {
  try {
    const date = new Date(period.trim());
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  } catch {
    return period;
  }
}

function buildCsv(
  reportType: string,
  data: Record<string, unknown>,
): string | null {
  switch (reportType) {
    case "cases-by-stage": {
      const rows = (data.stageReport ?? []) as Array<{
        stageName: string;
        stageGroupName: string;
        caseCount: number;
      }>;
      return (
        "Stage,Stage Group,Cases\n" +
        rows
          .map((r) => `"${r.stageName}","${r.stageGroupName}",${r.caseCount}`)
          .join("\n")
      );
    }
    case "team-member": {
      const rows = (data.teamMember ?? []) as Array<{
        name: string;
        caseCount: number;
      }>;
      return (
        "Team Member,Cases\n" +
        rows.map((r) => `"${r.name}",${r.caseCount}`).join("\n")
      );
    }
    case "time-in-stage": {
      const rows = (data.timeInStage ?? []) as Array<{
        stageName: string;
        stageGroupName: string;
        avgDays: number;
        transitionCount: number;
      }>;
      return (
        "Stage,Stage Group,Avg Days,Transitions\n" +
        rows
          .map(
            (r) =>
              `"${r.stageName}","${r.stageGroupName}",${r.avgDays},${r.transitionCount}`,
          )
          .join("\n")
      );
    }
    case "cases-over-time": {
      const rows = (data.casesOverTime ?? []) as Array<{
        period: string;
        opened: number;
        closed: number;
      }>;
      return (
        "Period,Opened,Closed\n" +
        rows.map((r) => `"${r.period}",${r.opened},${r.closed}`).join("\n")
      );
    }
    case "pipeline-funnel": {
      const rows = (data.pipelineFunnel ?? []) as Array<{
        name: string;
        count: number;
      }>;
      return (
        "Stage Group,Cases\n" +
        rows.map((r) => `"${r.name}",${r.count}`).join("\n")
      );
    }
    case "task-completion": {
      const stats = (data.taskStats ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      }) as { total: number; completed: number; overdue: number };
      return (
        "Metric,Count\n" +
        `Total,${stats.total}\n` +
        `Completed,${stats.completed}\n` +
        `Pending,${Math.max(stats.total - stats.completed - stats.overdue, 0)}\n` +
        `Overdue,${stats.overdue}`
      );
    }
    default:
      return null;
  }
}
