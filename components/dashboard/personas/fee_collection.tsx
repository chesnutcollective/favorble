import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { feePetitions, cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Sparkline } from "@/components/charts/sparkline";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import { LiveTicker, type TickerItem } from "@/components/dashboard/primitives/live-ticker";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.fee_collection.accent;
const canvasBg = "#0A0F1F"; // dark Stripe-finance canvas

const dollars = (cents: number | null | undefined) =>
  `$${Math.round((cents ?? 0) / 100).toLocaleString("en-US")}`;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadFinancials(orgId: string) {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  try {
    const [collectedYtdRow, atRiskRow, monthlyRows, monthRecRows] = await Promise.all([
      db
        .select({ sum: sql<number>`COALESCE(SUM(${feePetitions.collectedAmountCents}),0)::int` })
        .from(feePetitions)
        .where(
          and(
            eq(feePetitions.organizationId, orgId),
            gte(feePetitions.updatedAt, ytdStart),
          ),
        ),
      db
        .select({
          sum: sql<number>`COALESCE(SUM(${feePetitions.approvedAmountCents}),0)::int`,
          n: count(),
        })
        .from(feePetitions)
        .where(
          and(
            eq(feePetitions.organizationId, orgId),
            eq(feePetitions.status, "approved"),
            isNull(feePetitions.updatedAt),
            lte(feePetitions.approvedAt, new Date(Date.now() - 30 * 86400000)),
          ),
        ),
      db
        .select({
          month: sql<string>`date_trunc('month', ${feePetitions.updatedAt})::date::text`,
          sum: sql<number>`COALESCE(SUM(${feePetitions.collectedAmountCents}),0)::int`,
        })
        .from(feePetitions)
        .where(
          and(
            eq(feePetitions.organizationId, orgId),
            gte(feePetitions.updatedAt, new Date(Date.now() - 12 * 30 * 86400000)),
          ),
        )
        .groupBy(sql`date_trunc('month', ${feePetitions.updatedAt})`)
        .orderBy(sql`date_trunc('month', ${feePetitions.updatedAt})`),
      db
        .select({ sum: sql<number>`COALESCE(SUM(${feePetitions.collectedAmountCents}),0)::int` })
        .from(feePetitions)
        .where(
          and(
            eq(feePetitions.organizationId, orgId),
            gte(feePetitions.updatedAt, thirtyDaysAgo),
          ),
        ),
    ]);
    return {
      collectedYtd: collectedYtdRow[0]?.sum ?? 0,
      atRiskAmount: atRiskRow[0]?.sum ?? 0,
      atRiskCount: atRiskRow[0]?.n ?? 0,
      monthlyTrend: monthlyRows.map((r) => Math.round((r.sum ?? 0) / 100)),
      collected30d: monthRecRows[0]?.sum ?? 0,
    };
  } catch (e) {
    logger.error("fee collection financials failed", { error: e, orgId });
    return {
      collectedYtd: 0,
      atRiskAmount: 0,
      atRiskCount: 0,
      monthlyTrend: [],
      collected30d: 0,
    };
  }
}

async function loadDelinquent(orgId: string) {
  try {
    const rows = await db
      .select({
        id: feePetitions.id,
        caseId: feePetitions.caseId,
        approvedAt: feePetitions.approvedAt,
        approvedAmountCents: feePetitions.approvedAmountCents,
        caseNumber: cases.caseNumber,
      })
      .from(feePetitions)
      .leftJoin(cases, eq(cases.id, feePetitions.caseId))
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          eq(feePetitions.status, "approved"),
          isNull(feePetitions.updatedAt),
          lte(feePetitions.approvedAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .orderBy(desc(feePetitions.approvedAmountCents))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("fee collection delinquent failed", { error: e });
    return [];
  }
}

async function loadPaymentTicker(orgId: string): Promise<TickerItem[]> {
  try {
    const rows = await db
      .select({
        id: feePetitions.id,
        amount: feePetitions.collectedAmountCents,
        collectedAt: feePetitions.updatedAt,
        caseNumber: cases.caseNumber,
      })
      .from(feePetitions)
      .leftJoin(cases, eq(cases.id, feePetitions.caseId))
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          gte(feePetitions.updatedAt, new Date(Date.now() - 7 * 86400000)),
        ),
      )
      .orderBy(desc(feePetitions.updatedAt))
      .limit(20);
    return rows.map((r) => ({
      id: r.id,
      tone: "ok" as const,
      label: `+${dollars(r.amount)} · ${r.caseNumber ?? "—"}`,
      detail: "collected",
    }));
  } catch (e) {
    logger.error("fee collection ticker failed", { error: e });
    return [];
  }
}

function ageDays(d: Date | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// ── Component ──────────────────────────────────────────────────────────────

export async function FeeCollectionDashboard({ actor }: Props) {
  const [fin, delinquent, ticker] = await Promise.all([
    loadFinancials(actor.organizationId),
    loadDelinquent(actor.organizationId),
    loadPaymentTicker(actor.organizationId),
  ]);

  return (
    <div className="space-y-6">
      {ticker.length > 0 && (
        <LiveTicker
          items={ticker}
          height={28}
          background={canvasBg}
          className="rounded-[8px] overflow-hidden"
        />
      )}

      {/* Hero — dark Stripe-finance vibe */}
      <div
        className="rounded-[14px] p-8 dash-fade-up"
        style={{
          background: canvasBg,
          color: "#F5F5F7",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.10em] opacity-60 mb-2">
              Collected · Year to Date
            </div>
            <div
              className="font-semibold leading-none"
              style={{
                fontSize: 96,
                color: accent,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                letterSpacing: "-0.04em",
              }}
            >
              ${(fin.collectedYtd / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-[14px] opacity-70 mt-3">
              {dollars(fin.collected30d)} in the last 30 days · {dollars(fin.atRiskAmount)} at risk in {fin.atRiskCount} delinquent petitions
            </div>
            {fin.monthlyTrend.length > 0 && (
              <div className="mt-4" style={{ color: accent }}>
                <Sparkline
                  data={fin.monthlyTrend}
                  stroke={accent}
                  width={520}
                  height={48}
                />
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.10em] opacity-60">
              Dollars at Risk
            </div>
            <div
              className="text-[40px] font-semibold leading-none mt-1"
              style={{
                color: fin.atRiskAmount > 0 ? "#FCA5A5" : "#A7F3D0",
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
              }}
            >
              ${(fin.atRiskAmount / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[12px] opacity-60 mt-1">
              approved &gt;30d unpaid
            </div>
          </div>
        </div>
      </div>

      {/* Delinquent queue */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Delinquent Petitions
        </h2>
        {delinquent.length === 0 ? (
          <div
            className="rounded-[10px] border p-6 text-center text-[13px]"
            style={{ borderColor: COLORS.borderDefault, background: "#fff", color: COLORS.text2 }}
          >
            No delinquent petitions — collection is healthy.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {delinquent.map((d) => {
              const days = ageDays(d.approvedAt);
              return (
                <TriageCard
                  key={d.id}
                  avatar={(d.caseNumber ?? "??").slice(-2)}
                  avatarColor={accent}
                  title={dollars(d.approvedAmountCents)}
                  subtitle={`Case ${d.caseNumber ?? "—"}`}
                  meta={`${days}d unpaid`}
                  tags={[
                    {
                      label: days > 90 ? ">90 days" : days > 60 ? ">60 days" : ">30 days",
                      tone: days > 90 ? "bad" : days > 60 ? "warn" : "info",
                    },
                  ]}
                  accent={accent}
                  actions={[
                    {
                      label: "Open case",
                      variant: "primary",
                      href: d.caseId ? `/cases/${d.caseId}` : undefined,
                    },
                    { label: "Send follow-up", variant: "ghost" },
                    { label: "Mark collected", variant: "ghost" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
