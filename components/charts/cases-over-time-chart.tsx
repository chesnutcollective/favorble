"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

type CasesOverTimeRow = {
  period: string;
  opened: number;
  closed: number;
};

export function CasesOverTimeChart({ data }: { data: CasesOverTimeRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No timeline data
      </p>
    );
  }

  const formatted = data.map((row) => ({
    ...row,
    label: formatPeriod(row.period),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={formatted}
        margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          fontSize={12}
          tick={{ fill: "hsl(var(--foreground))" }}
        />
        <YAxis
          allowDecimals={false}
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
        <Legend />
        <Line
          type="monotone"
          dataKey="opened"
          name="Opened"
          stroke="#6366F1"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="closed"
          name="Closed"
          stroke="#22C55E"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatPeriod(period: string): string {
  try {
    const date = parseISO(period.trim());
    return format(date, "MMM yyyy");
  } catch {
    return period;
  }
}
