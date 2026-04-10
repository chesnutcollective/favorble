"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export type AljTrendPoint = {
  quarter: string;
  winRate: number;
  totalDecisions: number;
  won: number;
  lost: number;
};

export function AljTrendChart({ data }: { data: AljTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[#666] py-8 text-center">
        No closed decisions yet
      </p>
    );
  }

  const chartData = data.map((point) => ({
    ...point,
    winRatePct: Math.round(point.winRate * 1000) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={chartData}
        margin={{ top: 16, right: 24, left: 0, bottom: 10 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#EAEAEA"
          vertical={false}
        />
        <XAxis
          dataKey="quarter"
          fontSize={11}
          stroke="#999"
          tick={{ fill: "#666" }}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          fontSize={11}
          stroke="#999"
          tick={{ fill: "#666" }}
        />
        <ReferenceLine y={50} stroke="#EAEAEA" strokeDasharray="2 2" />
        <Tooltip
          cursor={{ stroke: "rgba(38,60,148,0.2)" }}
          contentStyle={{
            background: "#fff",
            border: "1px solid #EAEAEA",
            borderRadius: 10,
            fontSize: 12,
            fontFamily: "var(--font-dm-sans)",
          }}
          formatter={(_v: unknown, _n, item) => {
            const row = item.payload as AljTrendPoint & { winRatePct: number };
            return [
              `${row.winRatePct.toFixed(1)}% (${row.won}W / ${row.lost}L)`,
              "Win rate",
            ];
          }}
        />
        <Line
          type="monotone"
          dataKey="winRatePct"
          stroke="#263c94"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#263c94", strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "#1d72b8", strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
