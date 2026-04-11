import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getBottleneckAnalysis } from "@/app/actions/team-reports";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Bottlenecks",
};

export default async function BottlenecksPage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getBottleneckAnalysis>> = [];
  try {
    rows = await getBottleneckAnalysis();
  } catch {
    // DB unavailable
  }

  const total = rows.reduce((sum, r) => sum + r.activeCaseCount, 0);
  const withOverdue = rows.filter((r) => r.overdueTaskCount > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bottleneck Analysis"
        description="Stages where cases are piling up. 'Why' column lists heuristic root-cause hints (overdue tasks, missing PHI sheets, etc.)."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Stages flagged
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {rows.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Cases in flagged stages
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {total.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Stages with overdue tasks
            </p>
            <p
              className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums"
              style={{ color: withOverdue > 0 ? COLORS.bad : COLORS.ok }}
            >
              {withOverdue}
            </p>
          </CardContent>
        </Card>
      </div>

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
              Top stages by case count
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Heuristic bottleneck detection. Sort order: active case count.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Cases</TableHead>
                <TableHead className="text-right">Avg age</TableHead>
                <TableHead className="text-right">Overdue tasks</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6"
                    style={{ color: COLORS.text3 }}
                  >
                    No bottlenecks detected.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.stageId}>
                    <TableCell className="font-medium">
                      {r.stageName}
                    </TableCell>
                    <TableCell className="capitalize">
                      {r.owningTeam ? (
                        <Badge variant="outline">
                          {r.owningTeam.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span style={{ color: COLORS.text4 }}>—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.activeCaseCount}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      style={{
                        color:
                          r.avgAgeDays > 30
                            ? COLORS.bad
                            : r.avgAgeDays > 14
                            ? COLORS.warn
                            : COLORS.text1,
                      }}
                    >
                      {r.avgAgeDays}d
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      style={{
                        color: r.overdueTaskCount > 0 ? COLORS.bad : COLORS.text1,
                      }}
                    >
                      {r.overdueTaskCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.why.length === 0 ? (
                          <span
                            className="text-xs"
                            style={{ color: COLORS.text4 }}
                          >
                            no obvious cause
                          </span>
                        ) : (
                          r.why.map((reason, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              style={{
                                borderColor: COLORS.borderDefault,
                                color: COLORS.text2,
                              }}
                            >
                              {reason}
                            </Badge>
                          ))
                        )}
                      </div>
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
