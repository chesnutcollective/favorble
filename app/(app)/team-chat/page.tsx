import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getChannels, getMessages } from "@/app/actions/team-chat";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  TeamChatClient,
  type ChatChannel,
  type ChatMessage,
} from "@/components/team-chat/team-chat-client";
import { COLORS } from "@/lib/design-tokens";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, BubbleChatIcon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Team Chat" };
export const dynamic = "force-dynamic";

export default async function TeamChatPage() {
  const session = await requireSession();
  const rawChannels = await getChannels().catch(() => []);
  const channels: ChatChannel[] = rawChannels.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    channelType: c.channelType,
    caseId: c.caseId,
    isPrivate: c.isPrivate,
    createdAt: c.createdAt,
    lastMessageContent: c.lastMessageContent ?? null,
    lastMessageAt: c.lastMessageAt ?? null,
    lastMessageAuthor: c.lastMessageAuthor ?? null,
    unreadCount: c.unreadCount ?? 0,
  }));

  const firstChannel = channels[0];
  const initialMessagesRaw = firstChannel
    ? await getMessages(firstChannel.id).catch(() => [])
    : [];
  const initialMessages: ChatMessage[] = initialMessagesRaw.map((m) => ({
    id: m.id,
    content: m.content,
    parentMessageId: m.parentMessageId,
    mentionedUserIds: m.mentionedUserIds,
    reactions: m.reactions,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
    userId: m.userId,
    userFirstName: m.userFirstName,
    userLastName: m.userLastName,
    userAvatarUrl: m.userAvatarUrl,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Chat"
        description="Real-time conversations with your team and case-scoped channels."
        actions={
          <Button size="sm" style={{ backgroundColor: COLORS.brand }}>
            <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
            New Channel
          </Button>
        }
      />

      {firstChannel ? (
        <TeamChatClient
          channels={channels}
          initialMessages={initialMessages}
          initialChannelId={firstChannel.id}
          currentUserId={session.id}
          currentUserFirstName={session.firstName}
          currentUserLastName={session.lastName}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={BubbleChatIcon}
              title="No channels yet"
              description="Run the seed script or contact your admin to create channels for your team."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
