import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getNpsOverview,
  getNpsResponses,
  getNpsActionItems,
} from "@/app/actions/nps";
import { PageHeader } from "@/components/shared/page-header";
import { NpsClient } from "./nps-client";

export const metadata: Metadata = {
  title: "NPS Analytics",
};

const VALID_PERIODS = new Set(["30", "90", "180", "365", "0"]);

type SearchParams = Promise<{
  period?: string;
  tab?: string;
}>;

export default async function NpsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const rawPeriod = sp.period ?? "90";
  const period = VALID_PERIODS.has(rawPeriod) ? rawPeriod : "90";
  const periodDays = Number(period);

  const [overview, promoters, passives, detractors, actionItems] =
    await Promise.all([
      getNpsOverview(periodDays).catch(() => null),
      getNpsResponses({ category: "promoter", periodDays }).catch(() => []),
      getNpsResponses({ category: "passive", periodDays }).catch(() => []),
      getNpsResponses({ category: "detractor", periodDays }).catch(() => []),
      getNpsActionItems().catch(() => []),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="NPS Analytics"
        description="Net Promoter Score trends, comments, and follow-up action items."
      />
      <NpsClient
        overview={overview}
        promoters={promoters}
        passives={passives}
        detractors={detractors}
        actionItems={actionItems}
        period={period}
        initialTab={sp.tab ?? "overview"}
      />
    </div>
  );
}
