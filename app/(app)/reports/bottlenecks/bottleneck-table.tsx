"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import {
  getCasesAtStage,
  type BottleneckCase,
} from "@/app/actions/bottleneck-cases";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BottleneckRow = {
  stageId: string;
  stageName: string;
  owningTeam: string | null;
  activeCaseCount: number;
  avgAgeDays: number;
  overdueTaskCount: number;
  missingArtifactCount: number;
  why: string[];
};

type Props = {
  rows: BottleneckRow[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BottleneckTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drillCases, setDrillCases] = useState<BottleneckCase[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleRowClick(stageId: string) {
    if (expanded === stageId) {
      setExpanded(null);
      setDrillCases([]);
      return;
    }
    setExpanded(stageId);
    startTransition(async () => {
      try {
        const cases = await getCasesAtStage(stageId);
        setDrillCases(cases);
      } catch {
        setDrillCases([]);
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div
          className="px-6 py-3 border-b"
          style={{ borderColor: COLORS.borderSubtle }}
        >
          <h2 className="text-sm font-semibold" style={{ color: COLORS.text1 }}>
            Top stages by case count
          </h2>
          <p className="text-xs" style={{ color: COLORS.text3 }}>
            Heuristic bottleneck detection. Click a row to see stuck cases.
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
                <>
                  <TableRow
                    key={r.stageId}
                    className="cursor-pointer hover:bg-[rgba(38,60,148,0.03)] transition-colors"
                    onClick={() => handleRowClick(r.stageId)}
                    style={{
                      backgroundColor:
                        expanded === r.stageId ? COLORS.brandSubtle : undefined,
                    }}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="text-xs"
                          style={{ color: COLORS.text3 }}
                        >
                          {expanded === r.stageId ? "\u25BC" : "\u25B6"}
                        </span>
                        {r.stageName}
                      </span>
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
                        color:
                          r.overdueTaskCount > 0 ? COLORS.bad : COLORS.text1,
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
                  {expanded === r.stageId && (
                    <TableRow key={`${r.stageId}-drill`}>
                      <TableCell colSpan={6} className="p-0">
                        <div
                          className="px-6 py-4"
                          style={{ backgroundColor: COLORS.surface }}
                        >
                          {isPending ? (
                            <p
                              className="text-xs"
                              style={{ color: COLORS.text3 }}
                            >
                              Loading cases...
                            </p>
                          ) : drillCases.length === 0 ? (
                            <p
                              className="text-xs"
                              style={{ color: COLORS.text3 }}
                            >
                              No cases at this stage.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr
                                    className="border-b"
                                    style={{
                                      borderColor: COLORS.borderSubtle,
                                    }}
                                  >
                                    <th
                                      className="text-left px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Case #
                                    </th>
                                    <th
                                      className="text-right px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Dwell
                                    </th>
                                    <th
                                      className="text-left px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Assignee
                                    </th>
                                    <th
                                      className="text-right px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Overdue
                                    </th>
                                    <th
                                      className="text-left px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Last activity
                                    </th>
                                    <th
                                      className="text-center px-3 py-2 text-xs font-medium"
                                      style={{ color: COLORS.text3 }}
                                    >
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {drillCases.map((c) => (
                                    <tr
                                      key={c.caseId}
                                      className="border-b"
                                      style={{
                                        borderColor: COLORS.borderSubtle,
                                      }}
                                    >
                                      <td className="px-3 py-2 text-xs">
                                        <Link
                                          href={`/cases/${c.caseId}`}
                                          className="font-medium hover:underline"
                                          style={{ color: COLORS.brand }}
                                        >
                                          {c.caseNumber}
                                        </Link>
                                      </td>
                                      <td
                                        className="px-3 py-2 text-xs text-right tabular-nums"
                                        style={{
                                          color:
                                            c.dwellDays > 14
                                              ? COLORS.bad
                                              : COLORS.text1,
                                        }}
                                      >
                                        {c.dwellDays}d
                                      </td>
                                      <td className="px-3 py-2 text-xs">
                                        {c.assigneeName ?? (
                                          <span style={{ color: COLORS.text4 }}>
                                            Unassigned
                                          </span>
                                        )}
                                      </td>
                                      <td
                                        className="px-3 py-2 text-xs text-right tabular-nums"
                                        style={{
                                          color:
                                            c.overdueTaskCount > 0
                                              ? COLORS.bad
                                              : COLORS.text1,
                                        }}
                                      >
                                        {c.overdueTaskCount}
                                      </td>
                                      <td
                                        className="px-3 py-2 text-xs"
                                        style={{ color: COLORS.text3 }}
                                      >
                                        {c.lastActivityDate
                                          ? new Date(
                                              c.lastActivityDate,
                                            ).toLocaleDateString()
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-xs text-center">
                                        <Link
                                          href={`/cases/${c.caseId}`}
                                          className="inline-flex items-center px-2 py-1 rounded border text-[11px]"
                                          style={{
                                            borderColor: COLORS.brand,
                                            color: COLORS.brand,
                                          }}
                                        >
                                          View / Assign
                                        </Link>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
