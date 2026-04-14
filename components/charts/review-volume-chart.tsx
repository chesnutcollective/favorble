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

export type ReviewVolumePoint = {
  date: string;
  count: number;
  avgRating: number;
};

/**
 * 30-day volume + rating trend. Left axis is review count, right axis is
 * average rating on a 1-5 scale. When there's no data we show a compact
 * placeholder so the card isn't empty.
 */
export function ReviewVolumeChart({ data }: { data: ReviewVolumePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[12px] text-[#8b8b97]">
        <span className="font-medium text-[#666]">No review history yet</span>
        <span className="mt-1">Connect the integration to populate.</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart
        data={data}
        margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#EAEAEA" />
        <XAxis dataKey="date" fontSize={11} tick={{ fill: "#666" }} />
        <YAxis
          yAxisId="left"
          allowDecimals={false}
          fontSize={11}
          tick={{ fill: "#666" }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 5]}
          fontSize={11}
          tick={{ fill: "#666" }}
        />
        <Tooltip
          contentStyle={{
            background: "#fff",
            border: "1px solid #EAEAEA",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="count"
          name="Reviews"
          stroke="#1d72b8"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="avgRating"
          name="Avg rating"
          stroke="#cf8a00"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
