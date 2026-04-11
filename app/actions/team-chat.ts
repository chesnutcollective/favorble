"use server";

import { db } from "@/db/drizzle";
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, desc, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export async function getChannels(userId?: string) {
  const session = await requireSession();
  const targetUserId = userId ?? session.id;

  try {
    // Public channels in org + private channels user is a member of
    const rows = await db
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        description: chatChannels.description,
        channelType: chatChannels.channelType,
        caseId: chatChannels.caseId,
        isPrivate: chatChannels.isPrivate,
        createdAt: chatChannels.createdAt,
      })
      .from(chatChannels)
      .leftJoin(
        chatChannelMembers,
        and(
          eq(chatChannelMembers.channelId, chatChannels.id),
          eq(chatChannelMembers.userId, targetUserId),
        ),
      )
      .where(
        and(
          eq(chatChannels.organizationId, session.organizationId),
          or(
            eq(chatChannels.isPrivate, false),
            eq(chatChannelMembers.userId, targetUserId),
          ),
        ),
      )
      .orderBy(chatChannels.name);
    return rows;
  } catch (err) {
    logger.error("getChannels failed", { error: err });
    return [];
  }
}

export async function getMessages(channelId: string, limit = 50) {
  await requireSession();
  try {
    const rows = await db
      .select({
        id: chatMessages.id,
        content: chatMessages.content,
        parentMessageId: chatMessages.parentMessageId,
        mentionedUserIds: chatMessages.mentionedUserIds,
        reactions: chatMessages.reactions,
        editedAt: chatMessages.editedAt,
        createdAt: chatMessages.createdAt,
        userId: chatMessages.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userAvatarUrl: users.avatarUrl,
      })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(eq(chatMessages.channelId, channelId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  } catch (err) {
    logger.error("getMessages failed", { error: err });
    return [];
  }
}

export async function sendMessage(channelId: string, content: string) {
  const session = await requireSession();
  const [row] = await db
    .insert(chatMessages)
    .values({
      channelId,
      userId: session.id,
      content,
    })
    .returning();
  revalidatePath("/team-chat");
  return row;
}
