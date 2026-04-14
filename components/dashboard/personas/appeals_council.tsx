import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { appealsCouncilBriefs, cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { PercentileBand } from "@/components/dashboard/charts/percentile-band";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.appeals_council.accent;
const canvas = "#FAF3E0"; // parchment

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadGrantRate(orgId: string) {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  try {
    const [grantedRow, deniedRow, remandedRow, totalRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(appealsCouncilBriefs)
        .where(
          and(
            eq(appealsCouncilBriefs.organizationId, orgId),
            eq(appealsCouncilBriefs.outcome, "granted"),
            gte(appealsCouncilBriefs.outcomeAt, ytdStart),
          ),
        ),
      db
        .select({ n: count() })
        .from(appealsCouncilBriefs)
        .where(
          and(
            eq(appealsCouncilBriefs.organizationId, orgId),
            eq(appealsCouncilBriefs.outcome, "denied"),
            gte(appealsCouncilBriefs.outcomeAt, ytdStart),
          ),
        ),
      db
        .select({ n: count() })
        .from(appealsCouncilBriefs)
        .where(
          and(
            eq(appealsCouncilBriefs.organizationId, orgId),
            eq(appealsCouncilBriefs.outcome, "remanded"),
            gte(appealsCouncilBriefs.outcomeAt, ytdStart),
          ),
        ),
      db
        .select({ n: count() })
        .from(appealsCouncilBriefs)
        .where(
          and(
            eq(appealsCouncilBriefs.organizationId, orgId),
            sql`${appealsCouncilBriefs.outcome} IN ('granted','denied','remanded')`,
            gte(appealsCouncilBriefs.outcomeAt, ytdStart),
          ),
        ),
    ]);
    const granted = grantedRow[0]?.n ?? 0;
    const denied = deniedRow[0]?.n ?? 0;
    const remanded = remandedRow[0]?.n ?? 0;
    const total = totalRow[0]?.n ?? 0;
    const grantRate = total > 0 ? Math.round(((granted + remanded) / total) * 100) : null;
    return { granted, denied, remanded, total, grantRate };
  } catch (e) {
    logger.error("AC grant rate failed", { error: e, orgId });
    return { granted: 0, denied: 0, remanded: 0, total: 0, grantRate: null };
  }
}

async function loadUrgentBriefs(orgId: string) {
  const sevenOut = new Date(Date.now() + 7 * 86400000);
  try {
    const rows = await db
      .select({
        id: appealsCouncilBriefs.id,
        caseId: appealsCouncilBriefs.caseId,
        deadlineDate: appealsCouncilBriefs.deadlineDate,
        status: appealsCouncilBriefs.status,
        caseNumber: cases.caseNumber,
        adminLawJudge: cases.adminLawJudge,
      })
      .from(appealsCouncilBriefs)
      .leftJoin(cases, eq(cases.id, appealsCouncilBriefs.caseId))
      .where(
        and(
          eq(appealsCouncilBriefs.organizationId, orgId),
          isNull(appealsCouncilBriefs.filedAt),
          lte(appealsCouncilBriefs.deadlineDate, sevenOut),
        ),
      )
      .orderBy(appealsCouncilBriefs.deadlineDate)
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("AC urgent briefs failed", { error: e });
    return [];
  }
}

function daysUntil(d: Date | null): number {
  if (!d) return 999;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

// ── Component ──────────────────────────────────────────────────────────────

export async function AppealsCouncilDashboard({ actor }: Props) {
  const [grant, urgent] = await Promise.all([
    loadGrantRate(actor.organizationId),
    loadUrgentBriefs(actor.organizationId),
  ]);

  return (
    <div className="space-y-6">
      {/* Hero — Chamber aesthetic with brass */}
      <div
        className="rounded-[14px] border p-8 dash-fade-up"
        style={{
          background: canvas,
          borderColor: accent + "55",
          fontFamily: "Georgia, 'Source Serif 4', serif",
        }}
      >
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2"
              style={{ color: accent, fontFamily: "system-ui" }}
            >
              Grant Rate · Year to Date
            </div>
            {grant.grantRate !== null ? (
              <div
                className="font-semibold leading-none tabular-nums"
                style={{
                  fontSize: 140,
                  letterSpacing: "-0.02em",
                  color: COLORS.text1,
                }}
              >
                {grant.grantRate}%
              </div>
            ) : (
              <div
                className="font-semibold leading-tight"
                style={{
                  fontSize: 28,
                  letterSpacing: "-0.01em",
                  color: COLORS.text2,
                  fontFamily: "system-ui",
                  maxWidth: 460,
                }}
              >
                No decided briefs this year yet.
              </div>
            )}
            <p
              className="mt-3 text-[14px]"
              style={{ color: COLORS.text2, fontFamily: "system-ui", maxWidth: 460 }}
            >
              {grant.total > 0
                ? `${grant.granted} granted · ${grant.remanded} remanded · ${grant.denied} denied (${grant.total} decided this year)`
                : "Grant rate will appear once the Appeals Council rules on a filed brief."}
            </p>
            {grant.grantRate !== null && (
              <div className="mt-4 max-w-md" style={{ fontFamily: "system-ui" }}>
                <PercentileBand
                  value={Math.min(100, grant.grantRate * 5)}
                  label="vs national AC grant rate"
                  comparison="national avg ~10%"
                  goldThreshold={75}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Urgent deadline countdown */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Briefs Due in 7 Days
        </h2>
        {urgent.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-[13px]" style={{ color: COLORS.text2 }}>
              No urgent deadlines in the next 7 days. Use the time to polish drafts in review.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {urgent.map((b) => {
              const days = daysUntil(b.deadlineDate);
              return (
                <TriageCard
                  key={b.id}
                  avatar={(b.caseNumber ?? "??").slice(-2)}
                  avatarColor={accent}
                  title={`Case ${b.caseNumber ?? "—"}`}
                  subtitle={b.adminLawJudge ?? "ALJ TBD"}
                  meta={`${days}d to file`}
                  tags={[
                    {
                      label: b.status,
                      tone:
                        days <= 1
                          ? "bad"
                          : days <= 3
                            ? "warn"
                            : "info",
                    },
                  ]}
                  countdownPercent={Math.max(5, 100 - (days / 65) * 100)}
                  countdownLabel={`${days}d`}
                  accent={accent}
                  actions={[
                    {
                      label: "Open brief",
                      variant: "primary",
                      href: b.caseId ? `/appeals-council/${b.caseId}` : undefined,
                    },
                    { label: "AI draft", variant: "ghost" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Outcome summary */}
      <Card>
        <CardContent className="p-5">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
            style={{ color: COLORS.text2 }}
          >
            Outcome Summary · YTD
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                Granted
              </div>
              <div className="text-[32px] font-semibold tabular-nums" style={{ color: COLORS.emerald }}>
                {grant.granted}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                Remanded
              </div>
              <div className="text-[32px] font-semibold tabular-nums" style={{ color: accent }}>
                {grant.remanded}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                Denied
              </div>
              <div className="text-[32px] font-semibold tabular-nums" style={{ color: COLORS.text2 }}>
                {grant.denied}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
