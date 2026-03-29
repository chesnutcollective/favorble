import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { GlobeIcon, Message01Icon, Mail01Icon, WebhookIcon, LinkSquare02Icon, FileSearchIcon } from "@hugeicons/core-free-icons";
import * as caseStatusClient from "@/lib/integrations/case-status";
import * as outlookClient from "@/lib/integrations/outlook";
import { getEreCredentials } from "@/app/actions/ere";

export const metadata: Metadata = {
  title: "Integrations",
};

type IntegrationCardProps = {
  name: string;
  description: string;
  icon: React.ReactNode;
  isConfigured: boolean;
  status: string;
  details: string[];
  docsUrl?: string;
  manageUrl?: string;
};

function IntegrationCard({
  name,
  description,
  icon,
  isConfigured,
  status,
  details,
  docsUrl,
  manageUrl,
}: IntegrationCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2.5">{icon}</div>
            <div>
              <h3 className="font-medium text-foreground">{name}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              isConfigured
                ? "border-green-300 text-green-700"
                : "border-border text-muted-foreground"
            }
          >
            {status}
          </Badge>
        </div>

        <div className="mt-4 space-y-1.5">
          {details.map((detail, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {detail}
            </p>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {manageUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={manageUrl}>
                Manage
              </a>
            </Button>
          )}
          {docsUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                <HugeiconsIcon icon={LinkSquare02Icon} size={14} className="mr-1.5" />
                Documentation
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function IntegrationsPage() {
  const caseStatusConfigured = caseStatusClient.isConfigured();
  const outlookConfigured = outlookClient.isConfigured();

  let ereConfigured = false;
  try {
    const ereCreds = await getEreCredentials();
    ereConfigured = ereCreds.length > 0;
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Configure connections to Chronicle, Case Status, Outlook, and other services."
      />

      <div className="grid gap-4">
        <IntegrationCard
          name="Chronicle"
          description="SSA document sync and ERE access"
          icon={<HugeiconsIcon icon={GlobeIcon} size={20} color="rgb(147 51 234)" />}
          isConfigured={true}
          status="Deep Link"
          details={[
            "Deep links configured for each case with a Chronicle URL.",
            "Webhook endpoint available at /api/webhooks/chronicle",
            "Full API integration pending Chronicle vendor API availability.",
          ]}
        />

        <IntegrationCard
          name="ERE (Electronic Records Express)"
          description="Direct SSA document scraping and retrieval"
          icon={<HugeiconsIcon icon={FileSearchIcon} size={20} color="rgb(37 99 235)" />}
          isConfigured={ereConfigured}
          status={ereConfigured ? "Configured" : "Not configured"}
          details={
            ereConfigured
              ? [
                  "SSA Login.gov credentials are configured and encrypted.",
                  "Automated document scraping is available for cases with SSA claim numbers.",
                ]
              : [
                  "Add your SSA Login.gov credentials to enable direct document retrieval.",
                  "Credentials are encrypted at rest with AES-256-GCM.",
                ]
          }
          manageUrl="/admin/integrations/ere"
        />

        <IntegrationCard
          name="Case Status"
          description="Client messaging and Pizza Tracker"
          icon={<HugeiconsIcon icon={Message01Icon} size={20} color="rgb(22 163 74)" />}
          isConfigured={caseStatusConfigured}
          status={caseStatusConfigured ? "Connected" : "Not configured"}
          details={
            caseStatusConfigured
              ? [
                  "Inbound messages are received via webhook.",
                  "Outbound messaging is active.",
                  "Stage changes update the client-visible Pizza Tracker.",
                ]
              : [
                  "Set CASE_STATUS_API_KEY in environment variables to enable.",
                  "Webhook endpoint available at /api/webhooks/case-status",
                ]
          }
        />

        <IntegrationCard
          name="Microsoft Outlook"
          description="Email association and calendar sync"
          icon={<HugeiconsIcon icon={Mail01Icon} size={20} className="text-primary" />}
          isConfigured={outlookConfigured}
          status={outlookConfigured ? "Connected" : "Not configured"}
          details={
            outlookConfigured
              ? [
                  "Automated email association is active.",
                  "Calendar events sync bidirectionally.",
                  "Hearing events are synced to assigned staff calendars.",
                ]
              : [
                  "Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID to enable.",
                  "Requires Microsoft Graph API app registration.",
                ]
          }
        />

        <IntegrationCard
          name="Zapier (Website Leads)"
          description="Inbound lead capture from website forms"
          icon={<HugeiconsIcon icon={WebhookIcon} size={20} color="rgb(217 119 6)" />}
          isConfigured={true}
          status="Active"
          details={[
            "Webhook endpoint: /api/webhooks/zapier",
            "Accepts POST requests with lead data (firstName, lastName, email, phone).",
            "Automatically creates leads in the pipeline.",
          ]}
        />
      </div>
    </div>
  );
}
