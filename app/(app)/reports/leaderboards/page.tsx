import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import {
  getCompositeLeaderboard,
  getMessagingFrequencyLeaderboard,
  getResponseTimeLeaderboard,
} from "@/app/actions/leaderboards";
import { PageHeader } from "@/components/shared/page-header";

import { LeaderboardsClient } from "./client";

export const metadata: Metadata = {
  title: "Leaderboards",
};

const VALID_PERIODS = new Set(["7", "30", "90", "365"]);
const VALID_ROLES = new Set([
  "all",
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "phi_sheet_writer",
  "reviewer",
]);
const VALID_VIEWS = new Set(["composite", "messaging", "response-time"]);

type SearchParams = Promise<{
  period?: string;
  role?: string;
  view?: string;
}>;

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const period = VALID_PERIODS.has(sp.period ?? "") ? sp.period! : "30";
  const role = VALID_ROLES.has(sp.role ?? "") ? sp.role! : "all";
  const view = VALID_VIEWS.has(sp.view ?? "") ? sp.view! : "composite";

  const roleFilter = role === "all" ? null : role;

  const [composite, messaging, responseTime] = await Promise.all([
    getCompositeLeaderboard(period, roleFilter),
    getMessagingFrequencyLeaderboard(period, roleFilter),
    getResponseTimeLeaderboard(period, roleFilter),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboards"
        description="Staff performance rankings by activity, messaging, and responsiveness."
      />

      <LeaderboardsClient
        period={period}
        role={role}
        view={view}
        composite={composite}
        messaging={messaging}
        responseTime={responseTime}
      />
    </div>
  );
}
