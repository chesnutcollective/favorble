import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import * as caseStatusClient from "@/lib/integrations/case-status";
import {
  MessageThread,
  type SerializedMessage,
  type ThreadGroup,
} from "@/components/messages/message-thread";
import { sendCaseMessage } from "@/app/actions/messages";

/**
 * CM-1 — Case messages page.
 *
 * Loads communications for the case, sorts by threadId then createdAt
 * descending within each thread, and computes per-thread summary stats
 * (count, participants, oldest → newest range) so the client component
 * can render collapsible thread cards. Standalone messages with no
 * threadId are passed through and rendered at the bottom of the
 * thread.
 */

async function fetchCaseMessages(caseId: string) {
  return db
    .select()
    .from(communications)
    .where(and(eq(communications.caseId, caseId)))
    .orderBy(asc(communications.threadId), desc(communications.createdAt));
}

export type ThreadSummary = {
  threadId: string;
  messageCount: number;
  participants: string[];
  oldestAt: string;
  newestAt: string;
};

/**
 * Bucket messages by threadId and compute summary metadata for each
 * thread. Returns an array of `{ threadId, messages, summary }` plus a
 * separate `standalone` list for messages with no threadId.
 *
 * Threads are returned newest-thread-first (by their newest message)
 * so the most recently active conversation floats to the top of the
 * page.
 */
export function buildThreadGroups(messages: SerializedMessage[]): {
  threads: ThreadGroup[];
  standalone: SerializedMessage[];
} {
  const byThread = new Map<string, SerializedMessage[]>();
  const standalone: SerializedMessage[] = [];

  for (const msg of messages) {
    if (!msg.threadId) {
      standalone.push(msg);
      continue;
    }
    const arr = byThread.get(msg.threadId) ?? [];
    arr.push(msg);
    byThread.set(msg.threadId, arr);
  }

  const threads: ThreadGroup[] = [];
  for (const [threadId, msgs] of byThread.entries()) {
    // Within a thread, sort newest-first for header display but the
    // client component re-sorts to chronological for the body so the
    // conversation flows top-to-bottom oldest → newest.
    const sorted = [...msgs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const participants = Array.from(
      new Set(
        sorted
          .map((m) => m.fromAddress)
          .filter((addr): addr is string => Boolean(addr)),
      ),
    );

    const timestamps = sorted.map((m) => new Date(m.createdAt).getTime());
    const oldestAt = new Date(Math.min(...timestamps)).toISOString();
    const newestAt = new Date(Math.max(...timestamps)).toISOString();

    threads.push({
      summary: {
        threadId,
        messageCount: sorted.length,
        participants,
        oldestAt,
        newestAt,
      },
      messages: sorted,
    });
  }

  // Newest active thread first
  threads.sort(
    (a, b) =>
      new Date(b.summary.newestAt).getTime() -
      new Date(a.summary.newestAt).getTime(),
  );

  // Standalone newest first
  standalone.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return { threads, standalone };
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
  const serializedMessages: SerializedMessage[] = messages.map((msg) => ({
    id: msg.id,
    type: msg.type,
    body: msg.body,
    fromAddress: msg.fromAddress,
    threadId: msg.threadId,
    createdAt: msg.createdAt.toISOString(),
  }));

  const { threads, standalone } = buildThreadGroups(serializedMessages);

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
              <HugeiconsIcon icon={Message01Icon} size={20} aria-hidden="true" />
              <p className="text-sm">
                Case Status integration is not configured. Messages will be
                recorded locally only.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <MessageThread
        threads={threads}
        standalone={standalone}
        caseId={caseId}
        isConfigured={isConfigured}
        onSendMessage={sendCaseMessage}
      />
    </div>
  );
}
