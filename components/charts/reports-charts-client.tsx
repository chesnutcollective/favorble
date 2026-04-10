"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TaskCompletionPieChart } from "./task-completion-pie-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StageRow = {
  stageName: string;
  stageCode: string;
  stageGroupName: string;
  stageGroupColor: string | null;
  caseCount: number;
};

type TaskStats = {
  total: number;
  completed: number;
  overdue: number;
};

type Props = {
  stageReport: StageRow[];
  taskStats: TaskStats;
  onDateRangeChange: (
    start: string | null,
    end: string | null,
  ) => Promise<{
    stageReport: StageRow[];
    taskStats: TaskStats;
  }>;
};

export function ReportsChartsClient({
  stageReport: initialStageReport,
  taskStats: initialTaskStats,
  onDateRangeChange,
}: Props) {
  const [stageReport, setStageReport] = useState(initialStageReport);
  const [taskStats, setTaskStats] = useState(initialTaskStats);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Flatten stages for the bar chart
  const barData = stageReport.map((row) => ({
    name: row.stageName,
    count: row.caseCount,
    color: row.stageGroupColor ?? "#6B7280",
  }));

  async function handleFilter() {
    setLoading(true);
    try {
      const result = await onDateRangeChange(
        startDate || null,
        endDate || null,
      );
      setStageReport(result.stageReport);
      setTaskStats(result.taskStats);
    } finally {
      setLoading(false);
    }
  }

  function handleCsvExport() {
    const header = "Stage,Stage Group,Case Count\n";
    const rows = stageReport
      .map(
        (row) => `"${row.stageName}","${row.stageGroupName}",${row.caseCount}`,
      )
      .join("\n");

    const taskRows = [
      "",
      "Task Metric,Value",
      `Total Tasks,${taskStats.total}`,
      `Completed,${taskStats.completed}`,
      `Overdue,${taskStats.overdue}`,
    ].join("\n");

    const csv = header + rows + "\n" + taskRows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `caseflow-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="space-y-1.5 w-full sm:w-auto">
              <Label htmlFor="start-date">From</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="space-y-1.5 w-full sm:w-auto">
              <Label htmlFor="end-date">To</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <Button onClick={handleFilter} disabled={loading} size="sm">
              {loading ? "Filtering..." : "Apply Filter"}
            </Button>
            <Button onClick={handleCsvExport} variant="outline" size="sm">
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cases by Stage BarChart */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Cases by Stage</h3>
          {barData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No stage data
            </p>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Task Completion PieChart */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Task Completion</h3>
          <TaskCompletionPieChart data={taskStats} />
        </CardContent>
      </Card>
    </div>
  );
}
