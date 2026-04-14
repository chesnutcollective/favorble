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

export type WinRateChartRow = {
  name: string;
  winRate: number;
  totalDecisions: number;
  won: number;
  lost: number;
};

function barColor(winRate: number): string {
  if (winRate >= 0.6) return "#1d72b8";
  if (winRate >= 0.4) return "#cf8a00";
  return "#d1453b";
}

export function WinRateByDimensionChart({ data }: { data: WinRateChartRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[#666] py-8 text-center">
        No decisions in this period
      </p>
    );
  }

  const chartData = data.map((row) => ({
    ...row,
    winRatePct: Math.round(row.winRate * 1000) / 10,
  }));

  const height = Math.max(chartData.length * 36 + 40, 240);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 10, left: 10, right: 40, bottom: 10 }}
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          fontSize={11}
          stroke="#999"
          tick={{ fill: "#666" }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          fontSize={12}
          stroke="#999"
          tick={{ fill: "#263c94", fontFamily: "var(--font-dm-sans)" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(38,60,148,0.08)" }}
          contentStyle={{
            background: "#fff",
            border: "1px solid #EAEAEA",
            borderRadius: 10,
            fontSize: 12,
            fontFamily: "var(--font-dm-sans)",
          }}
          formatter={(_value: unknown, _name, item) => {
            const row = item.payload as WinRateChartRow & {
              winRatePct: number;
            };
            return [
              `${row.winRatePct.toFixed(1)}% (${row.won}W / ${row.lost}L)`,
              "Win rate",
            ];
          }}
        />
        <Bar dataKey="winRatePct" radius={[0, 6, 6, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={barColor(entry.winRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
