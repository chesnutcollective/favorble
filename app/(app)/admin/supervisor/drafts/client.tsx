"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLORS } from "@/lib/design-tokens";

export type DraftRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  caseId: string | null;
  caseNumber: string | null;
  reviewerName: string | null;
  createdAt: string | null;
};

const ALL = "__all__";

const TYPE_LABELS: Record<string, string> = {
  client_message: "Client message",
  client_letter: "Client letter",
  call_script: "Call script",
  appeal_form: "Appeal form",
  reconsideration_request: "Reconsideration",
  pre_hearing_brief: "Pre-hearing brief",
  appeals_council_brief: "AC brief",
  medical_records_request: "MR request",
  fee_petition: "Fee petition",
  task_instructions: "Task instructions",
  status_update: "Status update",
  rfc_letter: "RFC letter",
  coaching_conversation: "Coaching",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  generating: "Generating",
  draft_ready: "Draft ready",
  in_review: "In review",
  approved: "Approved",
  sent: "Sent",
  rejected: "Rejected",
  error: "Error",
};

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  generating: { color: COLORS.text3, bg: "rgba(139,139,151,0.10)" },
  draft_ready: { color: COLORS.brand, bg: COLORS.brandSubtle },
  in_review: { color: COLORS.warn, bg: COLORS.warnSubtle },
  approved: { color: COLORS.ok, bg: COLORS.okSubtle },
  sent: { color: COLORS.ok, bg: COLORS.okSubtle },
  rejected: { color: COLORS.bad, bg: COLORS.badSubtle },
  error: { color: COLORS.bad, bg: COLORS.badSubtle },
};

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function SupervisorDraftsClient({ rows }: { rows: DraftRow[] }) {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.type);
    return Array.from(set).sort();
  }, [rows]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.status);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== ALL && r.type !== typeFilter) return false;
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, typeFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: COLORS.text3 }}
          >
            Type
          </label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44 text-[12px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: COLORS.text3 }}
          >
            Status
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-[12px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className="ml-auto text-[11px]"
          style={{ color: COLORS.text3 }}
        >
          {filtered.length} of {rows.length}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const statusStyle =
                  STATUS_COLOR[r.status] ?? STATUS_COLOR.draft_ready;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/drafts/${r.id}`}
                        className="hover:underline"
                        style={{ color: COLORS.text1 }}
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell
                      className="text-[12px]"
                      style={{ color: COLORS.text2 }}
                    >
                      {TYPE_LABELS[r.type] ?? r.type}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {r.caseId && r.caseNumber ? (
                        <Link
                          href={`/cases/${r.caseId}`}
                          className="hover:underline"
                          style={{ color: COLORS.brand }}
                        >
                          {r.caseNumber}
                        </Link>
                      ) : (
                        <span style={{ color: COLORS.text3 }}>—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-[12px]"
                      style={{ color: COLORS.text2 }}
                    >
                      {r.reviewerName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{
                          color: statusStyle.color,
                          backgroundColor: statusStyle.bg,
                          borderColor: statusStyle.bg,
                        }}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right text-[12px]"
                      style={{ color: COLORS.text2 }}
                    >
                      {formatAge(r.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-[12px]"
                    style={{ color: COLORS.text3 }}
                  >
                    No drafts match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
