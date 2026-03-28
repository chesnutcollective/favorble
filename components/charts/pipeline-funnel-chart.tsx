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

type FunnelSegment = {
  name: string;
  color: string | null;
  count: number;
};

export function PipelineFunnelChart({ data }: { data: FunnelSegment[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No pipeline data
      </p>
    );
  }

  // Build single-row data with each segment name as a key
  const row: Record<string, string | number> = { name: "Pipeline" };
  for (const segment of data) {
    row[segment.name] = segment.count;
  }

  return (
    <ResponsiveContainer width="100%" height={60}>
      <BarChart
        data={[row]}
        layout="vertical"
        stackOffset="none"
        margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" hide />
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
        {data.map((segment) => (
          <Bar
            key={segment.name}
            dataKey={segment.name}
            stackId="pipeline"
            radius={0}
          >
            <Cell fill={segment.color ?? "#6B7280"} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Convert grouped stage data into a single-row stacked format for Recharts.
 */
export function buildFunnelRow(
  data: FunnelSegment[],
): Record<string, string | number> {
  const row: Record<string, string | number> = { name: "Pipeline" };
  for (const segment of data) {
    row[segment.name] = segment.count;
  }
  return row;
}
