import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { communications, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { COLORS } from "@/lib/design-tokens";
import { parseQaNotes } from "@/lib/services/message-qa";

export const metadata: Metadata = {
  title: "Message QA",
};

export const dynamic = "force-dynamic";

type ScoreFilter = "all" | "high" | "medium" | "low" | "failed";

type SearchParams = {
  score?: string;
};

function resolveFilter(value: string | undefined): ScoreFilter {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "failed"
  ) {
    return value;
  }
  return "all";
}

function bandForScore(score: number | null): {
  label: string;
  bg: string;
  fg: string;
} {
  if (score === null) return { label: "—", bg: "#F1F1F4", fg: COLORS.text2 };
  if (score >= 80) return { label: "High", bg: COLORS.okSubtle, fg: COLORS.ok };
  if (score >= 60)
    return { label: "Medium", bg: COLORS.warnSubtle, fg: COLORS.warn };
  if (score >= 40)
    return { label: "Low", bg: COLORS.badSubtle, fg: COLORS.bad };
  return { label: "Failed", bg: COLORS.badSubtle, fg: COLORS.bad };
}

export default async function MessageQaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const filter = resolveFilter(params.score);

  const conditions = [
    eq(communications.organizationId, session.organizationId),
    eq(communications.direction, "outbound"),
    isNotNull(communications.qaReviewedAt),
  ];

  if (filter === "high") {
    conditions.push(gte(communications.qaScore, 80));
  } else if (filter === "medium") {
    conditions.push(
      and(gte(communications.qaScore, 60), lt(communications.qaScore, 80))!,
    );
  } else if (filter === "low") {
    conditions.push(
      and(gte(communications.qaScore, 40), lt(communications.qaScore, 60))!,
    );
  } else if (filter === "failed") {
    conditions.push(lt(communications.qaScore, 40));
  }

  const rows = await db
    .select({
      id: communications.id,
      caseId: communications.caseId,
      body: communications.body,
      subject: communications.subject,
      createdAt: communications.createdAt,
      qaScore: communications.qaScore,
      qaStatus: communications.qaStatus,
      qaNotes: communications.qaNotes,
      userId: communications.userId,
      senderFirst: users.firstName,
      senderLast: users.lastName,
    })
    .from(communications)
    .leftJoin(users, eq(communications.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(communications.qaReviewedAt))
    .limit(100);

  // Aggregate per-sender avg score over the last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const aggregates = await db
    .select({
      userId: communications.userId,
      senderFirst: users.firstName,
      senderLast: users.lastName,
      avgScore: sql<number>`AVG(${communications.qaScore})::float`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(communications)
    .leftJoin(users, eq(communications.userId, users.id))
    .where(
      and(
        eq(communications.organizationId, session.organizationId),
        eq(communications.direction, "outbound"),
        isNotNull(communications.qaScore),
        gte(communications.qaReviewedAt, since),
      ),
    )
    .groupBy(communications.userId, users.firstName, users.lastName)
    .orderBy(desc(sql`AVG(${communications.qaScore})`));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Message QA"
        description="AI-reviewed outbound messages — last 100 reviewed, with per-sender averages."
      />

      {aggregates.length > 0 && (
        <div
          className="rounded-[10px] border p-4"
          style={{
            borderColor: COLORS.borderSubtle,
            backgroundColor: COLORS.brandSubtle,
          }}
        >
          <p
            className="text-[12px] font-medium mb-2"
            style={{ color: COLORS.brand }}
          >
            Per-sender averages (last 30 days)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {aggregates.map((a) => {
              const band = bandForScore(
                a.avgScore !== null ? Math.round(a.avgScore) : null,
              );
              return (
                <div
                  key={a.userId ?? "unknown"}
                  className="flex items-center justify-between rounded-[7px] bg-white border px-3 py-2"
                  style={{ borderColor: COLORS.borderSubtle }}
                >
                  <span className="text-[13px] text-foreground">
                    {a.senderFirst && a.senderLast
                      ? `${a.senderFirst} ${a.senderLast}`
                      : "Unassigned"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: band.bg, color: band.fg }}
                    >
                      {a.avgScore !== null ? Math.round(a.avgScore) : "—"}
                    </span>
                    <span className="text-[11px] text-[#999]">n={a.total}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[12px]">
        {(["all", "high", "medium", "low", "failed"] as ScoreFilter[]).map(
          (f) => (
            <Link
              key={f}
              href={`/admin/qa/messages${f === "all" ? "" : `?score=${f}`}`}
              className="rounded-full border px-3 py-1"
              style={{
                borderColor: f === filter ? COLORS.brand : COLORS.borderDefault,
                backgroundColor: f === filter ? COLORS.brandSubtle : "#FFFFFF",
                color: f === filter ? COLORS.brand : COLORS.text2,
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
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
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="px-4 py-2 font-medium">Sender</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Issues</th>
              <th className="px-4 py-2 font-medium">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No reviewed messages yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const band = bandForScore(row.qaScore);
              const notes = parseQaNotes(row.qaNotes);
              const issueCount = notes?.issues.length ?? 0;
              const excerpt =
                (row.subject ? `${row.subject} — ` : "") +
                (row.body ?? "").replace(/\s+/g, " ").slice(0, 160);
              return (
                <tr
                  key={row.id}
                  className="border-t border-[rgba(59,89,152,0.08)] hover:bg-[#FAFAFA]"
                >
                  <td className="px-4 py-2 max-w-[380px]">
                    {row.caseId ? (
                      <Link
                        href={`/cases/${row.caseId}/messages`}
                        className="block truncate"
                        style={{ color: COLORS.brand }}
                      >
                        {excerpt || "(empty)"}
                      </Link>
                    ) : (
                      <span className="block truncate text-[#666]">
                        {excerpt || "(empty)"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[12px]">
                    {row.senderFirst && row.senderLast
                      ? `${row.senderFirst} ${row.senderLast}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: band.bg, color: band.fg }}
                    >
                      {row.qaScore ?? "—"}
                    </span>
                    <span className="ml-2 text-[11px] text-[#999]">
                      {row.qaStatus ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-[#666]">
                    {issueCount}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-[#999] font-mono">
                    {new Date(row.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
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
