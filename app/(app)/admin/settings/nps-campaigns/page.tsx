import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  listNpsCampaigns,
  listTriggerStageOptions,
} from "@/app/actions/nps";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignList, CreateCampaignDialog } from "./campaign-dialogs";

export const metadata: Metadata = {
  title: "NPS Campaigns",
};

/**
 * Admin-only: manage NPS campaigns. Each campaign is a trigger (stage) + a
 * delay + a channel. When a case transitions into the trigger stage, a row
 * is enqueued on `nps_responses` and the dispatcher cron picks it up.
 */
export default async function NpsCampaignsAdminPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="NPS Campaigns"
          description="Trigger-based claimant surveys."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Only administrators can manage NPS campaigns.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [campaigns, stageOptions] = await Promise.all([
    listNpsCampaigns(),
    listTriggerStageOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="NPS Campaigns"
        description="Send claimants a survey when their case reaches a stage."
        actions={<CreateCampaignDialog stageOptions={stageOptions} />}
      />

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one to start collecting claimant NPS.
          </CardContent>
        </Card>
      ) : (
        <CampaignList campaigns={campaigns} />
      )}
    </div>
  );
}
