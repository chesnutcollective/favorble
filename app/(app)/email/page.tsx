import type { Metadata } from "next";
import { getAllEmails, getCasesForPicker } from "@/app/actions/emails";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { EmailQueueClient } from "./client";
import * as outlook from "@/lib/integrations/outlook";
import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";

export const metadata: Metadata = {
  title: "Email",
};

export default async function EmailPage() {
  const isConfigured = outlook.isConfigured();

  let emails: Awaited<ReturnType<typeof getAllEmails>> = [];
  let casesForPicker: Awaited<ReturnType<typeof getCasesForPicker>> = [];

  try {
    [emails, casesForPicker] = await Promise.all([
      getAllEmails(),
      getCasesForPicker(),
    ]);
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="Review and associate emails with cases. Auto-matched emails appear linked; unmatched emails can be manually associated."
      />

      {!isConfigured && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                icon={Mail01Icon}
                size={20}
                color="rgb(245 158 11)"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Microsoft Outlook not configured
                </p>
                <p className="text-sm text-muted-foreground">
                  Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and
                  MICROSOFT_TENANT_ID in your environment to enable automatic
                  email fetching.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {emails.length === 0 ? (
        <EmptyState
          icon={Mail01Icon}
          title="No emails yet"
          description="Emails fetched from Outlook will appear here for review and case association."
          accent="blue"
          bordered
        />
      ) : (
        <EmailQueueClient
          emails={emails.map((e) => ({
            id: e.id,
            type: e.type,
            subject: e.subject,
            body: e.body,
            fromAddress: e.fromAddress,
            toAddress: e.toAddress,
            createdAt: e.createdAt.toISOString(),
            caseId: e.caseId,
            caseNumber: e.caseNumber,
          }))}
          cases={casesForPicker}
        />
      )}
    </div>
  );
}
