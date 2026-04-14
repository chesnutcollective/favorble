"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/design-tokens";
import {
  getCasesAtHandoff,
  type BottleneckCase,
} from "@/app/actions/bottleneck-cases";

// ---------------------------------------------------------------------------
// SLA configuration (hours)
// ---------------------------------------------------------------------------
const HANDOFF_SLAS: Record<string, number> = {
  "intake|case_management": 48,
  "case_management|filing": 72,
  "case_management|medical_records": 24,
  "case_management|hearings": 168,
  "medical_records|case_management": 336,
};

const DEFAULT_SLA = 168; // 7 days fallback

function getSla(from: string, to: string): number {
  return HANDOFF_SLAS[`${from}|${to}`] ?? DEFAULT_SLA;
}

function slaColor(avgHours: number, sla: number): string {
  if (avgHours < sla) return COLORS.ok;
  if (avgHours < sla * 1.5) return COLORS.warn;
  return COLORS.bad;
}

function slaBgColor(avgHours: number, sla: number): string {
  if (avgHours < sla) return COLORS.okSubtle;
  if (avgHours < sla * 1.5) return COLORS.warnSubtle;
  return COLORS.badSubtle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type HandoffRow = {
  fromTeam: string;
  toTeam: string;
  caseCount: number;
  avgHours: number;
  p95Hours: number;
};

type Props = {
  rows: HandoffRow[];
  teams: string[];
};

export function HandoffMatrix({ rows, teams }: Props) {
  const [selectedCell, setSelectedCell] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [drillCases, setDrillCases] = useState<BottleneckCase[]>([]);
  const [isPending, startTransition] = useTransition();

  const matrix = new Map<string, HandoffRow>();
  for (const r of rows) {
    matrix.set(`${r.fromTeam}|${r.toTeam}`, r);
  }

  function handleCellClick(from: string, to: string) {
    if (selectedCell?.from === from && selectedCell?.to === to) {
      setSelectedCell(null);
      setDrillCases([]);
      return;
    }
    setSelectedCell({ from, to });
    startTransition(async () => {
      try {
        const cases = await getCasesAtHandoff(from, to);
        setDrillCases(cases);
      } catch {
        setDrillCases([]);
      }
    });
  }

  return (
    <>
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
              Handoff matrix (avg hours)
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Row = source team, column = destination team. Color = SLA status
              (green = within SLA, amber = approaching, red = breaching). Click
              a cell to see stuck cases.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: COLORS.borderSubtle }}
                >
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#666]">
                    From →
                  </th>
                  {teams.map((t) => (
                    <th
                      key={t}
                      className="text-center px-3 py-2 text-xs font-medium text-[#666] capitalize"
                    >
                      {t.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((from) => (
                  <tr
                    key={from}
                    className="border-b"
                    style={{ borderColor: COLORS.borderSubtle }}
                  >
                    <td className="px-3 py-2 text-xs font-medium capitalize">
                      {from.replace(/_/g, " ")}
                    </td>
                    {teams.map((to) => {
                      const cell = matrix.get(`${from}|${to}`);
                      if (!cell || from === to) {
                        return (
                          <td
                            key={to}
                            className="text-center px-3 py-2 text-xs"
                            style={{ color: COLORS.text4 }}
                          >
                            —
                          </td>
                        );
                      }
                      const sla = getSla(from, to);
                      const isSelected =
                        selectedCell?.from === from && selectedCell?.to === to;
                      return (
                        <td
                          key={to}
                          className="text-center px-3 py-2 text-xs tabular-nums cursor-pointer transition-all"
                          style={{
                            backgroundColor: isSelected
                              ? COLORS.brandSubtle
                              : slaBgColor(cell.avgHours, sla),
                          }}
                          onClick={() => handleCellClick(from, to)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleCellClick(from, to);
                            }
                          }}
                        >
                          <span
                            style={{ color: slaColor(cell.avgHours, sla) }}
                            className="font-semibold"
                          >
                            {cell.avgHours}h
                          </span>
                          <span
                            className="block text-[10px]"
                            style={{ color: COLORS.text3 }}
                          >
                            {cell.caseCount} case
                            {cell.caseCount === 1 ? "" : "s"}
                          </span>
                          <span
                            className="block text-[9px]"
                            style={{ color: COLORS.text4 }}
                          >
                            SLA: {sla}h
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Drill-through panel */}
      {selectedCell && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3
                className="text-sm font-semibold capitalize"
                style={{ color: COLORS.text1 }}
              >
                Cases: {selectedCell.from.replace(/_/g, " ")} →{" "}
                {selectedCell.to.replace(/_/g, " ")}
              </h3>
              <button
                onClick={() => {
                  setSelectedCell(null);
                  setDrillCases([]);
                }}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: COLORS.borderDefault,
                  color: COLORS.text2,
                }}
              >
                Close
              </button>
            </div>
            {isPending ? (
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                Loading cases...
              </p>
            ) : drillCases.length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                No cases currently stuck at this handoff point.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: COLORS.borderSubtle }}
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
                        Overdue tasks
                      </th>
                      <th
                        className="text-left px-3 py-2 text-xs font-medium"
                        style={{ color: COLORS.text3 }}
                      >
                        Last activity
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillCases.map((c) => (
                      <tr
                        key={c.caseId}
                        className="border-b"
                        style={{ borderColor: COLORS.borderSubtle }}
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
                            color: c.dwellDays > 14 ? COLORS.bad : COLORS.text1,
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
                            ? new Date(c.lastActivityDate).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
