/**
 * Email workspace — ELECTRONIC email integration (Microsoft Outlook).
 *
 * This page fetches emails from Outlook via Microsoft Graph, auto-matches
 * them to cases by contact email address, and lets users manually
 * associate unmatched emails with cases.
 *
 * For PHYSICAL paper mail (scanning, certified tracking, FedEx/UPS
 * outbound), see `/mail` (`app/(app)/mail/page.tsx`).
 */
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
  description:
    "Outlook email integration — review auto-matched emails and associate unmatched messages with cases.",
};

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; highlight?: string }>;
}) {
  const { filter: initialFilter, highlight: highlightId } = await searchParams;
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
        title="Electronic Email"
        description="Outlook email integration — review auto-matched messages and associate unmatched emails with cases. For physical paper mail, see Mail."
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
          initialFilter={initialFilter}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}
