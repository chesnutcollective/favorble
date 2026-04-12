import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  callRecordings,
  callTranscripts,
  callQcReviews,
  cases,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Call QA",
};

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "pending" | "reviewed" | "flagged";

type SearchParams = {
  status?: string;
};

function resolveStatus(value: string | undefined): StatusFilter {
  if (value === "pending" || value === "reviewed" || value === "flagged") {
    return value;
  }
  return "all";
}

function scoreBand(score: number | null) {
  if (score === null) return { bg: "#F1F1F4", fg: COLORS.text2 };
  if (score >= 80) return { bg: COLORS.okSubtle, fg: COLORS.ok };
  if (score >= 60) return { bg: COLORS.warnSubtle, fg: COLORS.warn };
  return { bg: COLORS.badSubtle, fg: COLORS.bad };
}

function statusBadge(status: string) {
  if (status === "flagged")
    return { bg: COLORS.badSubtle, fg: COLORS.bad, label: "flagged" };
  if (status === "reviewed")
    return { bg: COLORS.okSubtle, fg: COLORS.ok, label: "reviewed" };
  if (status === "pending_transcription" || status === "pending_review")
    return { bg: COLORS.warnSubtle, fg: COLORS.warn, label: "pending" };
  if (status === "transcribed")
    return { bg: COLORS.brandSubtle, fg: COLORS.brand, label: "transcribed" };
  if (status === "error")
    return { bg: COLORS.badSubtle, fg: COLORS.bad, label: "error" };
  return { bg: "#F1F1F4", fg: COLORS.text2, label: status };
}

export default async function CallsQaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const filter = resolveStatus(params.status);

  const conditions = [
    eq(callRecordings.organizationId, session.organizationId),
  ];
  if (filter === "pending") {
    conditions.push(
      inArray(callRecordings.status, [
        "pending_transcription",
        "transcribed",
        "pending_review",
      ]),
    );
  } else if (filter === "reviewed") {
    conditions.push(eq(callRecordings.status, "reviewed"));
  } else if (filter === "flagged") {
    conditions.push(eq(callRecordings.status, "flagged"));
  }

  const rows = await db
    .select({
      id: callRecordings.id,
      caseId: callRecordings.caseId,
      direction: callRecordings.direction,
      counterpartyName: callRecordings.counterpartyName,
      counterpartyPhone: callRecordings.counterpartyPhone,
      status: callRecordings.status,
      durationSeconds: callRecordings.durationSeconds,
      startedAt: callRecordings.startedAt,
      createdAt: callRecordings.createdAt,
      transcriptProvider: callTranscripts.provider,
      overallScore: callQcReviews.overallScore,
      caseNumber: cases.caseNumber,
      agentFirst: users.firstName,
      agentLast: users.lastName,
    })
    .from(callRecordings)
    .leftJoin(
      callTranscripts,
      eq(callTranscripts.callRecordingId, callRecordings.id),
    )
    .leftJoin(
      callQcReviews,
      eq(callQcReviews.callRecordingId, callRecordings.id),
    )
    .leftJoin(cases, eq(callRecordings.caseId, cases.id))
    .leftJoin(users, eq(callRecordings.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(callRecordings.createdAt))
    .limit(100);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Call QA"
        description="Call recordings, transcription state, and AI QC reviews. Click a row to open the transcript."
      />

      <div className="flex items-center gap-2 text-[12px]">
        {(["all", "pending", "reviewed", "flagged"] as StatusFilter[]).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/qa/calls${s === "all" ? "" : `?status=${s}`}`}
              className="rounded-full border px-3 py-1"
              style={{
                borderColor: s === filter ? COLORS.brand : COLORS.borderDefault,
                backgroundColor: s === filter ? COLORS.brandSubtle : "#FFFFFF",
                color: s === filter ? COLORS.brand : COLORS.text2,
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ),
        )}
      </div>

      <div className="rounded-[10px] border border-[rgba(59,89,152,0.13)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead
            className="text-left"
            style={{ backgroundColor: COLORS.brandSubtle, color: COLORS.brand }}
          >
            <tr>
              <th className="px-4 py-2 font-medium">Case</th>
              <th className="px-4 py-2 font-medium">Counterparty</th>
              <th className="px-4 py-2 font-medium">Agent</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No call recordings yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const s = statusBadge(row.status);
              const band = scoreBand(row.overallScore);
              return (
                <tr
                  key={row.id}
                  className="border-t border-[rgba(59,89,152,0.08)] hover:bg-[#FAFAFA]"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/qa/calls/${row.id}`}
                      className="font-mono text-[12px]"
                      style={{ color: COLORS.brand }}
                    >
                      {row.caseNumber ?? "(unlinked)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-[12px]">
                    {row.counterpartyName ?? row.counterpartyPhone ?? "—"}
                    <span className="ml-2 text-[11px] text-[#999]">
                      {row.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[12px]">
                    {row.agentFirst && row.agentLast
                      ? `${row.agentFirst} ${row.agentLast}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: s.bg, color: s.fg }}
                    >
                      {s.label}
                    </span>
                    {row.transcriptProvider === "stub" && (
                      <span className="ml-2 text-[10px] uppercase text-[#999]">
                        stub
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: band.bg, color: band.fg }}
                    >
                      {row.overallScore ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-[#999] font-mono">
                    {new Date(row.startedAt ?? row.createdAt).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
