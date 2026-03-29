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

  const total = data.reduce((sum, d) => sum + d.count, 0);

  // Build single-row data with each segment name as a key
  const row: Record<string, string | number> = { name: "Pipeline" };
  for (const segment of data) {
    row[segment.name] = segment.count;
  }

  return (
    <div className="space-y-3">
      {/* Segmented bar */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={40}>
          <BarChart
            data={[row]}
            layout="vertical"
            stackOffset="none"
            margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            barSize={40}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
                padding: "8px 12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{ display: "none" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value, name) => {
                const num = typeof value === "number" ? value : 0;
                return [
                  `${num} cases (${total > 0 ? Math.round((num / total) * 100) : 0}%)`,
                  String(name),
                ];
              }}
            />
            {data.map((segment, index) => (
              <Bar
                key={segment.name}
                dataKey={segment.name}
                stackId="pipeline"
                radius={
                  index === 0 && data.length === 1
                    ? [6, 6, 6, 6]
                    : index === 0
                      ? [6, 0, 0, 6]
                      : index === data.length - 1
                        ? [0, 6, 6, 0]
                        : [0, 0, 0, 0]
                }
              >
                <Cell fill={segment.color ?? "#6B7280"} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Segment breakdown below the bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2">
        {data.map((segment) => {
          const pct = total > 0 ? Math.round((segment.count / total) * 100) : 0;
          return (
            <div key={segment.name} className="flex items-center gap-2 min-w-0">
              <div
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: segment.color ?? "#6B7280" }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {segment.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {segment.count} &middot; {pct}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
