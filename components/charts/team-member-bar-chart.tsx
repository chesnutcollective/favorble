"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TeamMemberRow = {
  name: string;
  caseCount: number;
};

export function TeamMemberBarChart({ data }: { data: TeamMemberRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No team member data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 200)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 10, right: 20 }}
      >
        <XAxis type="number" allowDecimals={false} fontSize={12} />
        <YAxis
          type="category"
          dataKey="name"
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
        />
        <Bar
          dataKey="caseCount"
          name="Cases"
          fill="#6366F1"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
