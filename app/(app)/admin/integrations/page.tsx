import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, MessageSquare, Mail, Webhook, ExternalLink } from "lucide-react";
import * as caseStatusClient from "@/lib/integrations/case-status";
import * as outlookClient from "@/lib/integrations/outlook";

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
};

function IntegrationCard({
  name,
  description,
  icon,
  isConfigured,
  status,
  details,
  docsUrl,
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

        {docsUrl && (
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Documentation
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const caseStatusConfigured = caseStatusClient.isConfigured();
  const outlookConfigured = outlookClient.isConfigured();

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
          icon={<Globe className="h-5 w-5 text-purple-600" />}
          isConfigured={true}
          status="Deep Link"
          details={[
            "Deep links configured for each case with a Chronicle URL.",
            "Webhook endpoint available at /api/webhooks/chronicle",
            "Full API integration pending Chronicle vendor API availability.",
          ]}
        />

        <IntegrationCard
          name="Case Status"
          description="Client messaging and Pizza Tracker"
          icon={<MessageSquare className="h-5 w-5 text-green-600" />}
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
          icon={<Mail className="h-5 w-5 text-primary" />}
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
          icon={<Webhook className="h-5 w-5 text-amber-600" />}
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
