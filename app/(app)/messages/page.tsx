import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { communications, cases } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import * as caseStatusIntegration from "@/lib/integrations/case-status";
import { MessageFeed } from "./message-feed";

export const metadata: Metadata = {
  title: "Messages",
};

async function fetchRecentMessages(organizationId: string) {
  return db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      sourceSystem: communications.sourceSystem,
      createdAt: communications.createdAt,
      caseId: communications.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(communications)
    .leftJoin(cases, eq(communications.caseId, cases.id))
    .where(eq(communications.organizationId, organizationId))
    .orderBy(desc(communications.createdAt))
    .limit(100);
}

export default async function MessagesPage() {
  const user = await requireSession();
  const isConfigured = caseStatusIntegration.isConfigured();

  // Get recent communications
  let recentMessages: Awaited<ReturnType<typeof fetchRecentMessages>> = [];

  try {
    recentMessages = await fetchRecentMessages(user.organizationId);
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Client messages from Case Status across all cases."
      />

      {!isConfigured && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                icon={Message01Icon}
                size={20}
                color="rgb(245 158 11)"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Case Status not configured
                </p>
                <p className="text-sm text-muted-foreground">
                  Set CASE_STATUS_API_KEY in your environment to enable
                  bidirectional messaging.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {recentMessages.length === 0 ? (
        <EmptyState
          icon={Message01Icon}
          title="No messages yet"
          description="Messages from clients via Case Status will appear here."
          accent="blue"
          bordered
        />
      ) : (
        <MessageFeed
          messages={recentMessages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
