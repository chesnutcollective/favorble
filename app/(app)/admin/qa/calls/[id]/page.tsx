import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
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
  title: "Call transcript — QA",
};

export const dynamic = "force-dynamic";

type Segment = {
  speaker?: string;
  startMs?: number;
  endMs?: number;
  text?: string;
};

type Highlight = {
  kind: "positive" | "negative";
  text: string;
  transcriptOffsetMs?: number;
};

type Flag = {
  severity: "info" | "warn" | "critical";
  reason: string;
};

function scoreColor(score: number) {
  if (score >= 80) return { bg: COLORS.okSubtle, fg: COLORS.ok };
  if (score >= 60) return { bg: COLORS.warnSubtle, fg: COLORS.warn };
  return { bg: COLORS.badSubtle, fg: COLORS.bad };
}

function formatMs(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({
      id: callRecordings.id,
      caseId: callRecordings.caseId,
      caseNumber: cases.caseNumber,
      direction: callRecordings.direction,
      counterpartyName: callRecordings.counterpartyName,
      counterpartyPhone: callRecordings.counterpartyPhone,
      status: callRecordings.status,
      startedAt: callRecordings.startedAt,
      durationSeconds: callRecordings.durationSeconds,
      agentFirst: users.firstName,
      agentLast: users.lastName,
    })
    .from(callRecordings)
    .leftJoin(cases, eq(callRecordings.caseId, cases.id))
    .leftJoin(users, eq(callRecordings.userId, users.id))
    .where(
      and(
        eq(callRecordings.id, id),
        eq(callRecordings.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    notFound();
  }

  const [transcript] = await db
    .select({
      fullText: callTranscripts.fullText,
      segments: callTranscripts.segments,
      provider: callTranscripts.provider,
      confidence: callTranscripts.confidence,
    })
    .from(callTranscripts)
    .where(eq(callTranscripts.callRecordingId, id))
    .limit(1);

  const [review] = await db
    .select({
      overallScore: callQcReviews.overallScore,
      scores: callQcReviews.scores,
      highlights: callQcReviews.highlights,
      flags: callQcReviews.flags,
      summary: callQcReviews.summary,
      model: callQcReviews.model,
      createdAt: callQcReviews.createdAt,
    })
    .from(callQcReviews)
    .where(eq(callQcReviews.callRecordingId, id))
    .orderBy(desc(callQcReviews.createdAt))
    .limit(1);

  const segments = (transcript?.segments as Segment[] | null) ?? [];
  const highlights = (review?.highlights as Highlight[] | null) ?? [];
  const flags = (review?.flags as Flag[] | null) ?? [];
  const subScores = (review?.scores as Record<string, number> | null) ?? {};

  return (
    <div className="space-y-4">
      <PageHeader
        title="Call QA review"
        description={
          row.caseNumber
            ? `Linked to case ${row.caseNumber}`
            : "Not linked to a case"
        }
        actions={
          row.caseId ? (
            <Link
              href={`/cases/${row.caseId}`}
              className="rounded-[7px] border px-3 py-1 text-[13px]"
              style={{
                borderColor: COLORS.brand,
                color: COLORS.brand,
              }}
            >
              Back to case
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Transcript */}
        <div
          className="lg:col-span-2 rounded-[10px] border p-4"
          style={{ borderColor: COLORS.borderSubtle }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Transcript</h2>
            {transcript?.provider === "deepgram" ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: COLORS.brandSubtle,
                  color: COLORS.brand,
                }}
              >
                Transcribed by Deepgram
              </span>
            ) : (
              <span className="text-[11px] text-[#999] uppercase">
                {transcript?.provider ?? "none"}
              </span>
            )}
          </div>

          {(transcript?.provider === "stub" ||
            transcript?.provider === "stub_no_api_key") && (
            <div
              className="mb-3 rounded-[7px] border p-3 text-[12px]"
              style={{
                borderColor: COLORS.warnSubtle,
                backgroundColor: COLORS.warnSubtle,
                color: COLORS.warn,
              }}
            >
              This is a stub transcript. Set{" "}
              <code className="font-mono">DEEPGRAM_API_KEY</code> in your
              environment to enable real transcription — the pipeline will
              switch automatically on the next run. No code changes required.
            </div>
          )}

          {segments.length > 0 ? (
            <div className="space-y-3">
              {segments.map((seg, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-16 shrink-0 text-[11px] text-[#999] font-mono">
                    {formatMs(seg.startMs)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold uppercase text-[#666]">
                      {seg.speaker ?? "unknown"}
                    </p>
                    <p className="text-[13px] text-foreground">{seg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] whitespace-pre-wrap text-foreground">
              {transcript?.fullText ?? "(no transcript)"}
            </p>
          )}
        </div>

        {/* Sidebar: scores / flags / summary */}
        <aside className="space-y-4">
          <div
            className="rounded-[10px] border p-4"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2 className="text-[14px] font-semibold mb-3">Overall</h2>
            {review ? (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full text-[20px] font-semibold"
                    style={{
                      backgroundColor: scoreColor(review.overallScore).bg,
                      color: scoreColor(review.overallScore).fg,
                    }}
                  >
                    {review.overallScore}
                  </div>
                  <div className="text-[12px] text-[#666]">
                    <p>Model: {review.model ?? "—"}</p>
                    <p>
                      Reviewed:{" "}
                      {new Date(review.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(
                    [
                      "quality",
                      "compliance",
                      "empathy",
                      "professionalism",
                    ] as const
                  ).map((k) => {
                    const v = subScores[k] ?? 0;
                    const c = scoreColor(v);
                    return (
                      <div
                        key={k}
                        className="flex items-center justify-between"
                      >
                        <span className="text-[12px] capitalize text-[#666]">
                          {k}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: c.bg, color: c.fg }}
                        >
                          {v}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-[12px] text-[#999]">
                No QC review yet. Status: {row.status}
              </p>
            )}
          </div>

          {review?.summary && (
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2 className="text-[14px] font-semibold mb-2">Summary</h2>
              <p className="text-[13px] text-foreground whitespace-pre-wrap">
                {review.summary}
              </p>
            </div>
          )}

          {flags.length > 0 && (
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2 className="text-[14px] font-semibold mb-2">Flags</h2>
              <ul className="space-y-2">
                {flags.map((f, i) => (
                  <li key={i} className="text-[12px]">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase mr-2"
                      style={{
                        backgroundColor:
                          f.severity === "critical"
                            ? COLORS.badSubtle
                            : f.severity === "warn"
                              ? COLORS.warnSubtle
                              : COLORS.brandSubtle,
                        color:
                          f.severity === "critical"
                            ? COLORS.bad
                            : f.severity === "warn"
                              ? COLORS.warn
                              : COLORS.brand,
                      }}
                    >
                      {f.severity}
                    </span>
                    {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {highlights.length > 0 && (
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: COLORS.borderSubtle }}
            >
              <h2 className="text-[14px] font-semibold mb-2">Highlights</h2>
              <ul className="space-y-2">
                {highlights.map((h, i) => (
                  <li key={i} className="text-[12px]">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase mr-2"
                      style={{
                        backgroundColor:
                          h.kind === "positive"
                            ? COLORS.okSubtle
                            : COLORS.badSubtle,
                        color: h.kind === "positive" ? COLORS.ok : COLORS.bad,
                      }}
                    >
                      {h.kind}
                    </span>
                    {h.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div
            className="rounded-[10px] border p-4 text-[12px] text-[#666]"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2 className="text-[13px] font-semibold mb-1 text-foreground">
              Call details
            </h2>
            <p>Direction: {row.direction}</p>
            <p>
              Counterparty:{" "}
              {row.counterpartyName ?? row.counterpartyPhone ?? "—"}
            </p>
            <p>
              Agent:{" "}
              {row.agentFirst && row.agentLast
                ? `${row.agentFirst} ${row.agentLast}`
                : "—"}
            </p>
            <p>Duration: {row.durationSeconds ?? "—"}s</p>
            <p>Status: {row.status}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
