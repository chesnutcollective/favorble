import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  cases,
  caseContacts,
  contacts,
  caseStages,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  getCaseHealthForCases,
  type CaseHealth,
  type SentimentLabel,
} from "@/lib/services/case-health";
import { PageHeader } from "@/components/shared/page-header";
import { COLORS } from "@/lib/design-tokens";
import { getOrgSentimentTrend } from "@/app/actions/sentiment-analytics";
import {
  StackedBar,
  type StackedBarEntry,
  type StackedBarSeries,
} from "@/components/charts/stacked-bar";

export const metadata: Metadata = {
  title: "Client Health — QA",
};

export const dynamic = "force-dynamic";

type HealthBand = "red" | "amber" | "green";

function bandFor(score: number): HealthBand {
  if (score < 50) return "red";
  if (score < 75) return "amber";
  return "green";
}

function bandColor(band: HealthBand) {
  if (band === "red") return { bg: COLORS.badSubtle, fg: COLORS.bad };
  if (band === "amber") return { bg: COLORS.warnSubtle, fg: COLORS.warn };
  return { bg: COLORS.okSubtle, fg: COLORS.ok };
}

function labelPalette(label: SentimentLabel): { bg: string; fg: string } {
  switch (label) {
    case "positive":
      return { bg: COLORS.okSubtle, fg: COLORS.ok };
    case "neutral":
      return { bg: "#F1F1F4", fg: COLORS.text2 };
    case "confused":
      return { bg: COLORS.brandSubtle, fg: COLORS.brand };
    case "frustrated":
      return { bg: COLORS.warnSubtle, fg: COLORS.warn };
    case "angry":
    case "churn_risk":
      return { bg: COLORS.badSubtle, fg: COLORS.bad };
  }
}

function trendGlyph(trend: CaseHealth["trend"]): string {
  if (trend === "improving") return "↑";
  if (trend === "declining") return "↓";
  return "→";
}

export default async function ClientHealthPage() {
  const session = await requireSession();

  const caseRows = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      stageName: caseStages.name,
      claimantFirst: contacts.firstName,
      claimantLast: contacts.lastName,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(
      caseContacts,
      and(
        eq(caseContacts.caseId, cases.id),
        eq(caseContacts.isPrimary, true),
        eq(caseContacts.relationship, "claimant"),
      ),
    )
    .leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .orderBy(desc(cases.updatedAt))
    .limit(200);

  const caseIds = caseRows.map((c) => c.id);
  const [healthMap, trendDays] = await Promise.all([
    getCaseHealthForCases(caseIds),
    getOrgSentimentTrend(30),
  ]);

  const SENTIMENT_SERIES: StackedBarSeries[] = [
    { key: "positive", label: "Positive", color: COLORS.ok },
    { key: "neutral", label: "Neutral", color: COLORS.text4 },
    { key: "confused", label: "Confused", color: COLORS.brand },
    { key: "frustrated", label: "Frustrated", color: COLORS.warn },
    { key: "angry", label: "Angry", color: COLORS.bad },
    { key: "churn_risk", label: "Churn risk", color: "#7a1f18" },
  ];

  const trendBars: StackedBarEntry[] = trendDays.map((d) => ({
    label: d.date.slice(5), // mm-dd
    segments: SENTIMENT_SERIES.map((s) => ({
      key: s.key,
      value: d.counts[s.key as keyof typeof d.counts] ?? 0,
    })),
  }));

  const trendTotals = trendDays.reduce((acc, d) => acc + d.total, 0);

  const enriched = caseRows
    .map((c) => ({
      ...c,
      health:
        healthMap.get(c.id) ??
        ({
          caseId: c.id,
          score: 70,
          recentLabels: [],
          trend: "stable",
          sampleSize: 0,
          mostRecentLabel: null,
          mostRecentAt: null,
        } as CaseHealth),
    }))
    .sort((a, b) => a.health.score - b.health.score);

  const redCount = enriched.filter((e) => e.health.score < 50).length;
  const amberCount = enriched.filter(
    (e) => e.health.score >= 50 && e.health.score < 75,
  ).length;
  const greenCount = enriched.filter((e) => e.health.score >= 75).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Client Health"
        description="Active cases sorted by sentiment-driven health score. Worst first — dig in where the red band is."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="At risk" value={redCount} band="red" />
        <StatCard label="Watch" value={amberCount} band="amber" />
        <StatCard label="Healthy" value={greenCount} band="green" />
      </div>

      <div className="rounded-[10px] border border-[rgba(59,89,152,0.13)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead
            className="text-left"
            style={{ backgroundColor: COLORS.brandSubtle, color: COLORS.brand }}
          >
            <tr>
              <th className="px-4 py-2 font-medium">Case</th>
              <th className="px-4 py-2 font-medium">Claimant</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Health</th>
              <th className="px-4 py-2 font-medium">Trend</th>
              <th className="px-4 py-2 font-medium">Recent signals</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No active cases found.
                </td>
              </tr>
            )}
            {enriched.map((row) => {
              const band = bandFor(row.health.score);
              const c = bandColor(band);
              return (
                <tr
                  key={row.id}
                  className="border-t border-[rgba(59,89,152,0.08)] hover:bg-[#FAFAFA]"
                >
                  <td className="px-4 py-2 font-mono text-[12px]">
                    <Link
                      href={`/cases/${row.id}`}
                      className="text-[color:var(--text-1)] hover:underline"
                      style={{ color: COLORS.brand }}
                    >
                      {row.caseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {row.claimantFirst && row.claimantLast
                      ? `${row.claimantLast}, ${row.claimantFirst}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-[#666]">
                    {row.stageName ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      {row.health.score}
                    </span>
                    <span className="ml-2 text-[11px] text-[#999]">
                      {row.health.sampleSize === 0
                        ? "no signal"
                        : `n=${row.health.sampleSize}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-[#666]">
                    <span className="font-mono">
                      {trendGlyph(row.health.trend)}
                    </span>{" "}
                    {row.health.trend}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.health.recentLabels.slice(0, 5).map((l, i) => {
                        const p = labelPalette(l);
                        return (
                          <span
                            key={`${row.id}-${i}`}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
                            style={{ backgroundColor: p.bg, color: p.fg }}
                          >
                            {l.replace("_", " ")}
                          </span>
                        );
                      })}
                      {row.health.recentLabels.length === 0 && (
                        <span className="text-[11px] text-[#999]">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="rounded-[10px] border p-4"
        style={{
          borderColor: COLORS.borderSubtle,
          backgroundColor: "#FFFFFF",
        }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2
              className="text-[14px] font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Sentiment trend (last 30 days)
            </h2>
            <p className="text-[12px]" style={{ color: COLORS.text3 }}>
              Daily distribution of analyzed messages across the org.
            </p>
          </div>
          <span className="text-[11px]" style={{ color: COLORS.text3 }}>
            {trendTotals === 0
              ? "no analyzed messages yet"
              : `${trendTotals} analyzed`}
          </span>
        </div>
        <StackedBar
          bars={trendBars}
          series={SENTIMENT_SERIES}
          height={200}
          barWidth={14}
          gap={4}
          ariaLabel="Org-wide sentiment distribution per day"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  band,
}: {
  label: string;
  value: number;
  band: HealthBand;
}) {
  const c = bandColor(band);
  return (
    <div
      className="rounded-[10px] border p-4"
      style={{
        borderColor: COLORS.borderSubtle,
        backgroundColor: "#FFFFFF",
      }}
    >
      <p className="text-[12px] font-medium" style={{ color: c.fg }}>
        {label}
      </p>
      <p className="mt-1 text-[28px] font-semibold tracking-[-0.5px]">
        {value}
      </p>
    </div>
  );
}
