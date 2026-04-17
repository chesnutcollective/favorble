"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp01Icon,
  ArrowDown01Icon,
  Search01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import type { AljStatsRow } from "@/app/actions/win-rate-analytics";

type SortKey =
  | "aljName"
  | "hearingCount"
  | "winRate"
  | "avgDurationMinutes"
  | "lastHearingDate";
type SortDir = "asc" | "desc";

function winRateColor(winRate: number, total: number): string {
  if (total === 0) return "text-[#999]";
  if (winRate >= 0.6) return "text-[#1d72b8]";
  if (winRate >= 0.4) return "text-[#cf8a00]";
  return "text-[#d1453b]";
}

function formatDuration(mins: number | null): string {
  if (mins === null || Number.isNaN(mins)) return "—";
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function decisionPattern(row: AljStatsRow): string {
  const total = row.won + row.lost;
  if (total === 0) return "No decisions";
  if (row.won === total) return "Fully favorable";
  if (row.lost === total) return "Fully unfavorable";
  if (row.winRate >= 0.6) return "Mostly favorable";
  if (row.winRate <= 0.4) return "Mostly unfavorable";
  return "Mixed";
}

export function AljStatsClient({ rows }: { rows: AljStatsRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("hearingCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedAlj, setExpandedAlj] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.aljName.toLowerCase().includes(q))
      : rows;
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "aljName" ? "asc" : "desc");
    }
  };

  const SortHeader = ({
    label,
    keyName,
    align = "left",
  }: {
    label: string;
    keyName: SortKey;
    align?: "left" | "right";
  }) => {
    const active = sortKey === keyName;
    return (
      <TableHead
        className={cn(
          "cursor-pointer hover:text-[#263c94]",
          align === "right" && "text-right",
        )}
        onClick={() => handleSort(keyName)}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1",
            align === "right" && "justify-end",
          )}
        >
          {label}
          {active && (
            <HugeiconsIcon
              icon={sortDir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
              size={12}
              color="#263c94"
              aria-hidden="true"
            />
          )}
        </span>
      </TableHead>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          size={16}
          color="#999"
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ALJs..."
          className="pl-9"
        />
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#666]">
            {rows.length === 0
              ? "No ALJs encountered yet."
              : "No ALJs match your search."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="ALJ" keyName="aljName" />
                <SortHeader
                  label="Hearings"
                  keyName="hearingCount"
                  align="right"
                />
                <SortHeader label="Win Rate" keyName="winRate" align="right" />
                <SortHeader
                  label="Avg Duration"
                  keyName="avgDurationMinutes"
                  align="right"
                />
                <TableHead>Pattern</TableHead>
                <SortHeader
                  label="Last Hearing"
                  keyName="lastHearingDate"
                  align="right"
                />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const total = row.won + row.lost;
                const expanded = expandedAlj === row.aljName;
                return (
                  <Fragment key={row.aljName}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedAlj(expanded ? null : row.aljName)
                      }
                    >
                      <TableCell className="font-medium text-[#263c94]">
                        {row.aljName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.hearingCount}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-semibold",
                          winRateColor(row.winRate, total),
                        )}
                      >
                        {total > 0 ? `${(row.winRate * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[#666]">
                        {formatDuration(row.avgDurationMinutes)}
                      </TableCell>
                      <TableCell className="text-[#666]">
                        {decisionPattern(row)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[#666]">
                        {formatDate(row.lastHearingDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/reports/alj-stats/${encodeURIComponent(row.aljName)}`}
                          className="inline-flex items-center text-[#263c94] hover:text-[#1d72b8]"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`View ${row.aljName} detail`}
                        >
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            size={16}
                            color="currentColor"
                            aria-hidden="true"
                          />
                        </Link>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow
                        key={`${row.aljName}-detail`}
                        className="bg-[#F8F9FC]"
                      >
                        <TableCell colSpan={7} className="py-4">
                          <div className="space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium">
                              Recent Decisions
                            </p>
                            {row.recentDecisions.length === 0 ? (
                              <p className="text-[12px] text-[#666]">
                                No closed decisions yet.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {row.recentDecisions.map((d) => (
                                  <li
                                    key={d.caseId}
                                    className="text-[12px] flex items-center gap-3"
                                  >
                                    <span
                                      className={cn(
                                        "inline-block w-2 h-2 rounded-full",
                                        d.status === "closed_won"
                                          ? "bg-[#1d72b8]"
                                          : "bg-[#d1453b]",
                                      )}
                                    />
                                    <Link
                                      href={`/cases/${d.caseId}`}
                                      className="text-[#263c94] hover:underline font-medium"
                                    >
                                      {d.caseNumber}
                                    </Link>
                                    <span className="text-[#666]">
                                      {d.status === "closed_won"
                                        ? "Won"
                                        : "Lost"}
                                    </span>
                                    <span className="text-[#999]">
                                      {formatDate(d.closedAt)}
                                    </span>
                                    {d.hearingOffice && (
                                      <span className="text-[#999]">
                                        · {d.hearingOffice}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="pt-2">
                              <Link
                                href={`/reports/alj-stats/${encodeURIComponent(row.aljName)}`}
                                className="text-[12px] text-[#263c94] hover:underline"
                              >
                                View full ALJ profile →
                              </Link>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
