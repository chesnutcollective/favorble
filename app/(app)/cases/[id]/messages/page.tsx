import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import * as caseStatusClient from "@/lib/integrations/case-status";
import { MessageThread } from "@/components/messages/message-thread";
import { sendCaseMessage } from "@/app/actions/messages";

async function fetchCaseMessages(caseId: string) {
  return db
    .select()
    .from(communications)
    .where(and(eq(communications.caseId, caseId)))
    .orderBy(desc(communications.createdAt));
}

export default async function CaseMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  await requireSession();

  const isConfigured = caseStatusClient.isConfigured();

  // Get case messages
  let messages: Awaited<ReturnType<typeof fetchCaseMessages>> = [];

  try {
    messages = await fetchCaseMessages(caseId);
  } catch {
    // DB unavailable
  }

  // Serialize for client component
  const serializedMessages = messages.map((msg) => ({
    id: msg.id,
    type: msg.type,
    body: msg.body,
    fromAddress: msg.fromAddress,
    createdAt: msg.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description="Client messages via Case Status."
      />

      {!isConfigured && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-amber-600">
              <HugeiconsIcon icon={Message01Icon} size={20} />
              <p className="text-sm">
                Case Status integration is not configured. Messages will be
                recorded locally only.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <MessageThread
        messages={serializedMessages}
        caseId={caseId}
        isConfigured={isConfigured}
        onSendMessage={sendCaseMessage}
      />
    </div>
  );
}
