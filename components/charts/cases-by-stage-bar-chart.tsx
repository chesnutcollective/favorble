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

type StageGroup = {
  name: string;
  color: string | null;
  count: number;
};

export function CasesByStageBarChart({ data }: { data: StageGroup[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No active cases
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis type="number" allowDecimals={false} fontSize={12} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
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
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color ?? "#6B7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
