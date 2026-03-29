"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type TimeInStageRow = {
  stageName: string;
  stageGroupColor: string | null;
  avgDays: number;
};

export function TimeInStageChart({ data }: { data: TimeInStageRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No stage timing data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 200)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis
          type="number"
          allowDecimals={false}
          fontSize={12}
          label={{
            value: "Avg Days",
            position: "insideBottom",
            offset: -2,
            fontSize: 11,
          }}
        />
        <YAxis
          type="category"
          dataKey="stageName"
          width={140}
          fontSize={12}
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
          formatter={(value) => [`${value} days`, "Avg Time"]}
        />
        <Bar dataKey="avgDays" name="Avg Days" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.stageName}
              fill={entry.stageGroupColor ?? "#6B7280"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
