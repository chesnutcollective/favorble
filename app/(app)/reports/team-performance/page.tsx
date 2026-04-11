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

export default async function TeamPerformancePage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getAllUsersPerformance>> = [];
  try {
    rows = await getAllUsersPerformance();
  } catch {
    // DB unavailable
  }

  // Group by role
  const byRole = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }

  const sortedRoles = [...byRole.keys()].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Performance"
        description="Composite performance scores across every team member. Click a row for the full metric breakdown."
      />

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
            const roleRows = (byRole.get(role) ?? []).slice().sort(
              (a, b) => b.compositeScore - a.compositeScore,
            );
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
                        <TableHead className="text-right">
                          Composite
                        </TableHead>
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
                              <Badge
                                variant="outline"
                                className="capitalize"
                              >
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
