import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getAllUsersPerformance } from "@/app/actions/leaderboards";
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
  title: "Team Performance",
};

function scoreColor(score: number): string {
  if (score >= 80) return COLORS.ok;
  if (score >= 60) return COLORS.warn;
  return COLORS.bad;
}

const PERIOD_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
] as const;

type SearchParams = Promise<{
  period?: string;
  role?: string;
}>;

export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const period = PERIOD_OPTIONS.some((p) => p.key === sp.period)
    ? sp.period!
    : "7d";
  const roleFilter = sp.role ?? null;

  let rows: Awaited<ReturnType<typeof getAllUsersPerformance>> = [];
  try {
    rows = await getAllUsersPerformance();
  } catch {
    // DB unavailable
  }

  if (roleFilter) {
    rows = rows.filter((r) => r.role === roleFilter);
  }

  // Group by role
  const byRole = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }

  const sortedRoles = [...byRole.keys()].sort();
  const allRoles = [...new Set(rows.map((r) => r.role))].sort();

  // Build CSV export URL with current filters
  const csvParams = new URLSearchParams();
  if (roleFilter) csvParams.set("role", roleFilter);
  const csvUrl = `/api/reports/team-performance/csv${csvParams.toString() ? `?${csvParams}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Performance"
        description="Composite performance scores across every team member. Click a row for the full metric breakdown."
        actions={
          <a
            href={csvUrl}
            className="inline-flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-[#EAEAEA] text-[#263c94] hover:border-[#263c94] transition-colors"
            download
          >
            Download CSV
          </a>
        }
      />

      {/* Period selector */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Period
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((p) => (
                <Link
                  key={p.key}
                  href={`/reports/team-performance?period=${p.key}${roleFilter ? `&role=${roleFilter}` : ""}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs"
                  style={{
                    borderColor:
                      p.key === period ? COLORS.brand : COLORS.borderDefault,
                    color: p.key === period ? COLORS.brand : COLORS.text2,
                    background:
                      p.key === period ? COLORS.brandSubtle : "transparent",
                  }}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
          {allRoles.length > 1 && (
            <div>
              <p
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text3 }}
              >
                Role filter
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/reports/team-performance?period=${period}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs"
                  style={{
                    borderColor: !roleFilter
                      ? COLORS.brand
                      : COLORS.borderDefault,
                    color: !roleFilter ? COLORS.brand : COLORS.text2,
                    background: !roleFilter
                      ? COLORS.brandSubtle
                      : "transparent",
                  }}
                >
                  All roles
                </Link>
                {allRoles.map((r) => (
                  <Link
                    key={r}
                    href={`/reports/team-performance?period=${period}&role=${r}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs capitalize"
                    style={{
                      borderColor:
                        r === roleFilter ? COLORS.brand : COLORS.borderDefault,
                      color: r === roleFilter ? COLORS.brand : COLORS.text2,
                      background:
                        r === roleFilter ? COLORS.brandSubtle : "transparent",
                    }}
                  >
                    {r.replace(/_/g, " ")}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-[#666]">
              No performance snapshots yet. Run the rollup cron or the seed
              script to populate historical data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedRoles.map((role) => {
            const roleRows = (byRole.get(role) ?? [])
              .slice()
              .sort((a, b) => b.compositeScore - a.compositeScore);
            return (
              <Card key={role}>
                <CardContent className="p-0">
                  <div
                    className="px-6 py-3 border-b"
                    style={{ borderColor: COLORS.borderSubtle }}
                  >
                    <h2
                      className="text-sm font-semibold capitalize"
                      style={{ color: COLORS.text1 }}
                    >
                      {role.replace(/_/g, " ")}
                    </h2>
                    <p className="text-xs" style={{ color: COLORS.text3 }}>
                      {roleRows.length} member
                      {roleRows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-right">Composite</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleRows.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <Link
                              href={`/reports/team-performance/${r.userId}`}
                              className="font-medium hover:underline"
                              style={{ color: COLORS.brand }}
                            >
                              {r.name}
                            </Link>
                            <p
                              className="text-xs"
                              style={{ color: COLORS.text3 }}
                            >
                              {r.email}
                            </p>
                          </TableCell>
                          <TableCell>
                            {r.team ? (
                              <Badge variant="outline" className="capitalize">
                                {r.team.replace(/_/g, " ")}
                              </Badge>
                            ) : (
                              <span
                                className="text-xs"
                                style={{ color: COLORS.text4 }}
                              >
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className="text-lg font-bold tabular-nums"
                              style={{ color: scoreColor(r.compositeScore) }}
                            >
                              {r.compositeScore}
                            </span>
                            <span
                              className="text-xs ml-1"
                              style={{ color: COLORS.text3 }}
                            >
                              / 100
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.compositeScore >= 80 ? (
                              <Badge
                                style={{
                                  background: COLORS.okSubtle,
                                  color: COLORS.ok,
                                }}
                              >
                                Healthy
                              </Badge>
                            ) : r.compositeScore >= 60 ? (
                              <Badge
                                style={{
                                  background: COLORS.warnSubtle,
                                  color: COLORS.warn,
                                }}
                              >
                                Watch
                              </Badge>
                            ) : (
                              <Badge
                                style={{
                                  background: COLORS.badSubtle,
                                  color: COLORS.bad,
                                }}
                              >
                                At risk
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
