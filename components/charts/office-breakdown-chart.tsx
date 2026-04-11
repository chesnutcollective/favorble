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

export type OfficeBreakdownPoint = {
  office: string;
  won: number;
  lost: number;
  totalDecisions: number;
  winRate: number;
};

function barColor(winRate: number): string {
  if (winRate >= 0.6) return "#1d72b8";
  if (winRate >= 0.4) return "#cf8a00";
  return "#d1453b";
}

export function OfficeBreakdownChart({
  data,
}: {
  data: OfficeBreakdownPoint[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[#666] py-6 text-center">
        No office breakdown available
      </p>
    );
  }

  const height = Math.max(data.length * 38 + 32, 180);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 6, left: 10, right: 30, bottom: 6 }}
      >
        <XAxis
          type="number"
          allowDecimals={false}
          fontSize={11}
          stroke="#999"
          tick={{ fill: "#666" }}
        />
        <YAxis
          type="category"
          dataKey="office"
          width={140}
          fontSize={12}
          stroke="#999"
          tick={{ fill: "#263c94" }}
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
          formatter={(_v: unknown, _n, item) => {
            const row = item.payload as OfficeBreakdownPoint;
            return [
              `${row.totalDecisions} decisions (${row.won}W / ${row.lost}L, ${(row.winRate * 100).toFixed(0)}%)`,
              "Total",
            ];
          }}
        />
        <Bar dataKey="totalDecisions" radius={[0, 6, 6, 0]}>
          {data.map((entry) => (
            <Cell key={entry.office} fill={barColor(entry.winRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
