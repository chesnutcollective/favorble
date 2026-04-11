import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import {
  getLeaderboard,
  getCompositeLeaderboard,
} from "@/app/actions/leaderboards";
import { ROLE_METRICS } from "@/lib/services/role-metrics";
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
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Leaderboards",
};

type SearchParams = Promise<{
  role?: string;
  metric?: string;
  period?: "day" | "week" | "month";
}>;

const DEFAULT_ROLE = "case_manager";

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const role = sp.role && ROLE_METRICS[sp.role] ? sp.role : DEFAULT_ROLE;
  const pack = ROLE_METRICS[role] ?? ROLE_METRICS[DEFAULT_ROLE];
  const metricKey =
    sp.metric && pack.metrics.some((m) => m.metricKey === sp.metric)
      ? sp.metric
      : pack.metrics[0]?.metricKey ?? "";
  const period = sp.period ?? "week";

  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let compositeRows: Awaited<ReturnType<typeof getCompositeLeaderboard>> = [];
  try {
    [rows, compositeRows] = await Promise.all([
      metricKey
        ? getLeaderboard(role, metricKey, period)
        : Promise.resolve([]),
      getCompositeLeaderboard(role, period),
    ]);
  } catch {
    // DB unavailable
  }

  const metric = pack.metrics.find((m) => m.metricKey === metricKey);

  const availableRoles = Object.keys(ROLE_METRICS).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboards"
        description="Rank team members by composite score or a single metric. Use the selectors to switch roles and metrics."
      />

      {/* Filter tiles */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Role
            </p>
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((r) => (
                <Link
                  key={r}
                  href={`/reports/leaderboards?role=${r}&period=${period}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs capitalize"
                  style={{
                    borderColor:
                      r === role ? COLORS.brand : COLORS.borderDefault,
                    color: r === role ? COLORS.brand : COLORS.text2,
                    background: r === role ? COLORS.brandSubtle : "transparent",
                  }}
                >
                  {r.replace(/_/g, " ")}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Metric
            </p>
            <div className="flex flex-wrap gap-2">
              {pack.metrics.map((m) => (
                <Link
                  key={m.metricKey}
                  href={`/reports/leaderboards?role=${role}&metric=${m.metricKey}&period=${period}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs"
                  style={{
                    borderColor:
                      m.metricKey === metricKey
                        ? COLORS.brand
                        : COLORS.borderDefault,
                    color:
                      m.metricKey === metricKey ? COLORS.brand : COLORS.text2,
                    background:
                      m.metricKey === metricKey
                        ? COLORS.brandSubtle
                        : "transparent",
                  }}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          </div>
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
                  href={`/reports/leaderboards?role=${role}&metric=${metricKey}&period=${p}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs capitalize"
                  style={{
                    borderColor: p === period ? COLORS.brand : COLORS.borderDefault,
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Composite leaderboard */}
        <Card>
          <CardContent className="p-0">
            <div
              className="px-6 py-3 border-b"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2
                className="text-sm font-semibold capitalize"
                style={{ color: COLORS.text1 }}
              >
                Composite ranking
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                Weighted average across all {pack.label} metrics
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compositeRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-[#999] py-6"
                    >
                      No data yet
                    </TableCell>
                  </TableRow>
                ) : (
                  compositeRows.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="tabular-nums">{r.rank}</TableCell>
                      <TableCell>
                        <Link
                          href={`/reports/team-performance/${r.userId}`}
                          className="hover:underline"
                          style={{ color: COLORS.brand }}
                        >
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className="tabular-nums font-semibold"
                          style={{
                            color:
                              r.compositeScore >= 80
                                ? COLORS.ok
                                : r.compositeScore >= 60
                                ? COLORS.warn
                                : COLORS.bad,
                          }}
                        >
                          {r.compositeScore}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Single-metric leaderboard */}
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
                {metric?.label ?? "Metric"} ranking
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                {metric?.direction === "higher_is_better"
                  ? "Higher is better"
                  : "Lower is better"}
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-[#999] py-6"
                    >
                      No data yet
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="tabular-nums">{r.rank}</TableCell>
                      <TableCell>
                        <Link
                          href={`/reports/team-performance/${r.userId}`}
                          className="hover:underline"
                          style={{ color: COLORS.brand }}
                        >
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.value}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.deltaPercent !== null ? (
                          <Badge
                            variant="outline"
                            style={{
                              color:
                                r.deltaPercent >= 0
                                  ? COLORS.ok
                                  : COLORS.bad,
                            }}
                          >
                            {r.deltaPercent >= 0 ? "+" : ""}
                            {r.deltaPercent}%
                          </Badge>
                        ) : (
                          <span className="text-[#999]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
