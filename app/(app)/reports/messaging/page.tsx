import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StackedBar } from "@/components/charts/stacked-bar";
import { COLORS } from "@/lib/design-tokens";
import {
  getMessagingAnalytics,
  type AnalyticsPeriod,
  type MessagingAnalytics,
} from "@/app/actions/messaging-analytics";

export const metadata: Metadata = {
  title: "Messaging analytics",
};

type SearchParams = Promise<{ period?: "day" | "week" | "month" }>;

function emptyState(period: AnalyticsPeriod): MessagingAnalytics {
  return {
    period,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    tiles: {
      totalInbound: 0,
      totalOutbound: 0,
      automatedCount: 0,
      automatedPercent: 0,
      avgResponseMinutes: 0,
    },
    timeSeries: [],
    perUser: [],
  };
}

export default async function MessagingReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;
  const period: AnalyticsPeriod =
    sp.period === "day" || sp.period === "month" ? sp.period : "week";

  let data: MessagingAnalytics = emptyState(period);
  try {
    data = await getMessagingAnalytics(period);
  } catch {
    // DB unavailable → keep empty state
  }

  const { tiles, timeSeries, perUser } = data;
  const hasTimeSeries = timeSeries.some(
    (p) => p.inbound + p.outbound + p.automated > 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messaging analytics"
        description="Inbound vs outbound volume, automation share, and per-user response times."
      />

      {/* Period filter */}
      <Card>
        <CardContent className="p-5">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Period
            </p>
            <div className="flex gap-2">
              {(["day", "week", "month"] as const).map((p) => (
                <Link
                  key={p}
                  href={`/reports/messaging?period=${p}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs capitalize"
                  style={{
                    borderColor:
                      p === period ? COLORS.brand : COLORS.borderDefault,
                    color: p === period ? COLORS.brand : COLORS.text2,
                    background:
                      p === period ? COLORS.brandSubtle : "transparent",
                  }}
                >
                  {p}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Total inbound" value={tiles.totalInbound} />
        <MetricTile label="Total outbound" value={tiles.totalOutbound} />
        <MetricTile
          label="Automated"
          value={tiles.automatedCount}
          sub={`${tiles.automatedPercent}% of outbound`}
        />
        <MetricTile
          label="Avg response"
          value={tiles.avgResponseMinutes}
          sub="minutes"
        />
      </div>

      {/* Time series */}
      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2
              className="text-sm font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Last 30 days · inbound vs outbound vs automated
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Each bar is a day. Stacks show inbound, human-sent outbound, and
              automated outbound.
            </p>
          </div>
          <div className="px-6 py-4">
            {!hasTimeSeries ? (
              <p
                className="text-sm text-center py-6"
                style={{ color: COLORS.text3 }}
              >
                No messaging activity in this window.
              </p>
            ) : (
              <StackedBar
                bars={timeSeries.map((p) => ({
                  label: p.date.slice(5), // MM-DD
                  segments: [
                    { key: "inbound", value: p.inbound },
                    { key: "outbound", value: p.outbound },
                    { key: "automated", value: p.automated },
                  ],
                }))}
                series={[
                  {
                    key: "inbound",
                    label: "Inbound",
                    color: COLORS.ok,
                  },
                  {
                    key: "outbound",
                    label: "Outbound (human)",
                    color: COLORS.brand,
                  },
                  {
                    key: "automated",
                    label: "Automated",
                    color: COLORS.brass,
                  },
                ]}
                height={180}
                ariaLabel="Messages per day, last 30 days"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-user table */}
      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2
              className="text-sm font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Per-user · {period}
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Outbound volume, automation share, response time, and value-add
              feature adoption.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Outbound</TableHead>
                <TableHead className="text-right">Automated %</TableHead>
                <TableHead className="text-right">Avg resp (min)</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">Docs shared</TableHead>
                <TableHead className="text-right">Appts</TableHead>
                <TableHead className="text-right">Automations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perUser.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-[#999] py-6"
                  >
                    No outbound messages in this window
                  </TableCell>
                </TableRow>
              ) : (
                perUser.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <Link
                        href={`/reports/team-performance/${r.userId}`}
                        className="hover:underline"
                        style={{ color: COLORS.brand }}
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-[#666] capitalize">
                      {r.role.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {r.outboundCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.automatedPercent}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.avgResponseMinutes || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.responseCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.documentShares}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.appointmentsCreated}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {r.automationsTriggered}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: COLORS.text3 }}
        >
          {label}
        </p>
        <p
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: COLORS.text1 }}
        >
          {value.toLocaleString()}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs" style={{ color: COLORS.text3 }}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
