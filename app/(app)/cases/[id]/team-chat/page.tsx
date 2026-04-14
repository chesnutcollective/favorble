import { requireSession } from "@/lib/auth/session";
import {
  getOrCreateCaseChannel,
  getMessages,
} from "@/app/actions/team-chat";
import { CaseChatPanel } from "@/components/team-chat/case-chat-panel";
import type { ChatMessage } from "@/components/team-chat/team-chat-client";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CaseTeamChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const session = await requireSession();

  let channel: { id: string; name: string } | null = null;
  let initialMessages: ChatMessage[] = [];

  try {
    channel = await getOrCreateCaseChannel(caseId);
    const raw = await getMessages(channel.id);
    initialMessages = raw.map((m) => ({
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
  } catch {
    // DB unavailable — fall through to error card below.
  }

  if (!channel) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Unable to load the team chat channel for this case. Please refresh
            the page or contact your admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <CaseChatPanel
      channelId={channel.id}
      channelName={channel.name}
      channelDescription={`Internal team conversation for this case`}
      initialMessages={initialMessages}
      currentUserId={session.id}
      currentUserFirstName={session.firstName}
      currentUserLastName={session.lastName}
    />
  );
}
