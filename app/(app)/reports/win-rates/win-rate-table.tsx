"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";

export type WinRateTableRow = {
  name: string;
  won: number;
  lost: number;
  winRate: number;
  totalDecisions: number;
};

type SortKey = "name" | "won" | "lost" | "totalDecisions" | "winRate";
type SortDir = "asc" | "desc";

function winRateColor(winRate: number): string {
  if (winRate >= 0.6) return "text-[#1d72b8]";
  if (winRate >= 0.4) return "text-[#cf8a00]";
  return "text-[#d1453b]";
}

export function WinRateTable({
  rows,
  dimensionLabel,
}: {
  rows: WinRateTableRow[];
  dimensionLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("totalDecisions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
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
            />
          )}
        </span>
      </TableHead>
    );
  };

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[#666]">
        No decisions found for the selected period.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader label={dimensionLabel} keyName="name" />
          <SortHeader label="Decisions" keyName="totalDecisions" align="right" />
          <SortHeader label="Won" keyName="won" align="right" />
          <SortHeader label="Lost" keyName="lost" align="right" />
          <SortHeader label="Win Rate" keyName="winRate" align="right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.name}>
            <TableCell className="font-medium text-[#1a1a1a]">
              {row.name}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.totalDecisions}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1d72b8]">
              {row.won}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#d1453b]">
              {row.lost}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums font-semibold",
                winRateColor(row.winRate),
              )}
            >
              {(row.winRate * 100).toFixed(1)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
