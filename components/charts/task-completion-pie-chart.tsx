"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type TaskStats = {
  total: number;
  completed: number;
  overdue: number;
};

const COLORS = {
  completed: "#22C55E",
  overdue: "#EF4444",
  pending: "#6B7280",
};

export function TaskCompletionPieChart({ data }: { data: TaskStats }) {
  const pending = data.total - data.completed - data.overdue;
  const chartData = [
    { name: "Completed", value: data.completed, color: COLORS.completed },
    { name: "Overdue", value: data.overdue, color: COLORS.overdue },
    { name: "Pending", value: Math.max(pending, 0), color: COLORS.pending },
  ].filter((d) => d.value > 0);

  if (data.total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No tasks to display
      </p>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
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
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-foreground">
              {entry.name}: {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
