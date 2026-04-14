"use server";

import { db } from "@/db/drizzle";
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  users,
  cases,
  contacts,
  caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, desc, or, gt, sql, count, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Fetch channels the current user can see, enriched with:
 * - lastMessageContent / lastMessageAt / lastMessageAuthor
 * - unreadCount (messages after the member's lastReadAt)
 */
export async function getChannels(userId?: string) {
  const session = await requireSession();
  const targetUserId = userId ?? session.id;

  try {
    // Subquery: latest message per channel
    const latestMsg = db
      .select({
        channelId: chatMessages.channelId,
        lastMessageAt: sql<Date>`max(${chatMessages.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(chatMessages)
      .groupBy(chatMessages.channelId)
      .as("latest_msg");

    // Main query: channels + membership + latest message metadata
    const rows = await db
      .select({
        id: chatChannels.id,
        name: chatChannels.name,
        description: chatChannels.description,
        channelType: chatChannels.channelType,
        caseId: chatChannels.caseId,
        isPrivate: chatChannels.isPrivate,
        createdAt: chatChannels.createdAt,
        lastReadAt: chatChannelMembers.lastReadAt,
        lastMessageAt: latestMsg.lastMessageAt,
      })
      .from(chatChannels)
      .leftJoin(
        chatChannelMembers,
        and(
          eq(chatChannelMembers.channelId, chatChannels.id),
          eq(chatChannelMembers.userId, targetUserId),
        ),
      )
      .leftJoin(latestMsg, eq(latestMsg.channelId, chatChannels.id))
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

    // For each channel, grab last message preview + unread count
    const enriched = await Promise.all(
      rows.map(async (ch) => {
        // Last message preview
        const [lastMsg] = await db
          .select({
            content: chatMessages.content,
            createdAt: chatMessages.createdAt,
            authorFirstName: users.firstName,
            authorLastName: users.lastName,
          })
          .from(chatMessages)
          .leftJoin(users, eq(chatMessages.userId, users.id))
          .where(eq(chatMessages.channelId, ch.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);

        // Unread count
        let unreadCount = 0;
        if (ch.lastReadAt) {
          const [result] = await db
            .select({ value: count() })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.channelId, ch.id),
                gt(chatMessages.createdAt, ch.lastReadAt),
              ),
            );
          unreadCount = result?.value ?? 0;
        } else if (ch.lastMessageAt) {
          // Never read — all messages are unread
          const [result] = await db
            .select({ value: count() })
            .from(chatMessages)
            .where(eq(chatMessages.channelId, ch.id));
          unreadCount = result?.value ?? 0;
        }

        return {
          id: ch.id,
          name: ch.name,
          description: ch.description,
          channelType: ch.channelType,
          caseId: ch.caseId,
          isPrivate: ch.isPrivate,
          createdAt: ch.createdAt,
          lastMessageContent: lastMsg?.content ?? null,
          lastMessageAt: lastMsg?.createdAt ?? null,
          lastMessageAuthor: lastMsg
            ? [lastMsg.authorFirstName, lastMsg.authorLastName]
                .filter(Boolean)
                .join(" ")
            : null,
          unreadCount,
        };
      }),
    );

    return enriched;
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
  try {
    const [row] = await db
      .insert(chatMessages)
      .values({
        channelId,
        userId: session.id,
        content,
      })
      .returning();

    // Auto-mark channel as read after sending
    await db
      .update(chatChannelMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.userId, session.id),
        ),
      );

    revalidatePath("/team-chat");
    return row;
  } catch (err) {
    logger.error("sendMessage failed", { error: err });
    throw err;
  }
}

/**
 * Get or create the case-scoped team chat channel for a case.
 *
 * Case chat channels are keyed on `chat_channels.caseId` with
 * channelType="case". We look up the first existing channel for the case in
 * the current org; if none exists, we create one named after the claimant
 * (falling back to the case number) and auto-join the current user so they
 * can post right away.
 */
export async function getOrCreateCaseChannel(caseId: string): Promise<{
  id: string;
  name: string;
}> {
  const session = await requireSession();

  // 1. Verify the case exists in this org (guards against cross-org access).
  const [caseRow] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) {
    throw new Error("Case not found");
  }

  // 2. Look for an existing case channel.
  const [existing] = await db
    .select({ id: chatChannels.id, name: chatChannels.name })
    .from(chatChannels)
    .where(
      and(
        eq(chatChannels.organizationId, session.organizationId),
        eq(chatChannels.channelType, "case"),
        eq(chatChannels.caseId, caseId),
      ),
    )
    .limit(1);

  if (existing) {
    // Ensure the current user has a membership row so unread counts work.
    await db
      .insert(chatChannelMembers)
      .values({
        channelId: existing.id,
        userId: session.id,
      })
      .onConflictDoNothing({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
      });

    return existing;
  }

  // 3. Build a human-friendly channel name: "Claimant Name · CASE-123".
  let claimantLabel: string | null = null;
  try {
    const [primary] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          eq(caseContacts.caseId, caseId),
          eq(caseContacts.isPrimary, true),
          eq(caseContacts.relationship, "claimant"),
        ),
      )
      .limit(1);
    if (primary) {
      claimantLabel =
        [primary.firstName, primary.lastName].filter(Boolean).join(" ").trim() ||
        null;
    }
  } catch (err) {
    logger.warn("getOrCreateCaseChannel: claimant lookup failed", {
      error: err,
    });
  }

  const channelName = claimantLabel
    ? `${claimantLabel} · ${caseRow.caseNumber}`
    : caseRow.caseNumber;

  try {
    const [created] = await db
      .insert(chatChannels)
      .values({
        organizationId: session.organizationId,
        name: channelName,
        description: `Case-scoped team chat for ${caseRow.caseNumber}`,
        channelType: "case",
        caseId,
        isPrivate: false,
        createdBy: session.id,
      })
      .returning({ id: chatChannels.id, name: chatChannels.name });

    // Auto-join the creator so unread counts start fresh.
    await db
      .insert(chatChannelMembers)
      .values({
        channelId: created.id,
        userId: session.id,
        lastReadAt: new Date(),
      })
      .onConflictDoNothing({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
      });

    return created;
  } catch (err) {
    logger.error("getOrCreateCaseChannel failed", { error: err, caseId });
    throw err;
  }
}

export async function markChannelRead(channelId: string) {
  const session = await requireSession();
  try {
    // Upsert: update lastReadAt if membership exists
    const updated = await db
      .update(chatChannelMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.userId, session.id),
        ),
      )
      .returning();

    // If not a member yet (public channel), insert membership
    if (updated.length === 0) {
      await db
        .insert(chatChannelMembers)
        .values({
          channelId,
          userId: session.id,
          lastReadAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [chatChannelMembers.channelId, chatChannelMembers.userId],
          set: { lastReadAt: new Date() },
        });
    }

    revalidatePath("/team-chat");
  } catch (err) {
    logger.error("markChannelRead failed", { error: err });
  }
}
