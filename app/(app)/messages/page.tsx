import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import * as caseStatusIntegration from "@/lib/integrations/case-status";
import { MessageFeed } from "./message-feed";
import { MessagesFilterStrip } from "./filter-strip";
import {
  getMessages,
  parseMessageFilters,
  type MessageRow,
} from "@/app/actions/messages";

export const metadata: Metadata = {
  title: "Messages",
};

type SearchParams = Promise<{
  highlight?: string;
  urgency?: string;
  category?: string;
  unread?: string;
}>;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await requireSession();
  const isConfigured = caseStatusIntegration.isConfigured();

  const filters = parseMessageFilters({
    urgency: params.urgency,
    category: params.category,
    unread: params.unread,
  });

  let recentMessages: MessageRow[] = [];

  try {
    recentMessages = await getMessages(filters);
  } catch {
    // DB unavailable
  }

  const hasActiveFilters =
    !!filters.urgency || !!filters.category || !!filters.unreadOnly;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Client messages from Case Status across all cases."
      />

      {!isConfigured && user.role === "admin" && (
        <Card className="border-[#eaeaea]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                icon={Message01Icon}
                size={20}
                className="text-[#666]"
              />
              <div>
                <p className="text-sm font-medium text-[#171717]">
                  Case-status integration is not yet configured
                </p>
                <p className="text-sm text-[#666]">
                  Add your API key in{" "}
                  <a
                    href="/admin/integrations"
                    className="underline hover:text-[#171717]"
                  >
                    /admin/integrations
                  </a>{" "}
                  to enable bidirectional messaging.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <MessagesFilterStrip
        urgency={filters.urgency}
        category={filters.category}
        unread={filters.unreadOnly}
      />

      {recentMessages.length === 0 ? (
        <EmptyState
          icon={Message01Icon}
          title={hasActiveFilters ? "No messages match your filters" : "No messages yet"}
          description={
            hasActiveFilters
              ? "Try clearing a filter or adjusting the urgency/category selection."
              : "Messages from clients via Case Status will appear here."
          }
        />
      ) : (
        <MessageFeed
          messages={recentMessages}
          highlightId={params.highlight}
        />
      )}
    </div>
  );
}
