import "server-only";
import { db } from "@/db/drizzle";
import { notifications, notificationDeliveries } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Notification primitive. Every SA-1 / SA-7 / coaching / compliance
 * alert lands here. For now we ship in_app delivery only — email / SMS
 * / push channels are stubbed and can be wired to external providers
 * without touching callers.
 */

export type CreateNotificationInput = {
  organizationId: string;
  userId: string;
  caseId?: string | null;
  title: string;
  body: string;
  priority?: "info" | "normal" | "high" | "urgent";
  actionLabel?: string;
  actionHref?: string;
  dedupeKey?: string;
  sourceEventId?: string | null;
  channels?: Array<"in_app" | "email" | "sms" | "push">;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    // Dedup check — if a notification with this dedupeKey already
    // exists and is unread, skip creating a duplicate. Keeps recurring
    // scans (deadline-approaching, stagnant-case) from spamming.
    if (input.dedupeKey) {
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, input.userId),
            eq(notifications.dedupeKey, input.dedupeKey),
            isNull(notifications.readAt),
          ),
        )
        .limit(1);
      if (existing) {
        return existing.id;
      }
    }

    const [row] = await db
      .insert(notifications)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        caseId: input.caseId ?? null,
        title: input.title,
        body: input.body,
        priority: input.priority ?? "normal",
        actionLabel: input.actionLabel,
        actionHref: input.actionHref,
        dedupeKey: input.dedupeKey,
        sourceEventId: input.sourceEventId ?? null,
      })
      .returning({ id: notifications.id });

    // Deliver to the requested channels. in_app is always implicit
    // (the row itself). email/sms/push are stubs that log an attempt
    // — external providers can be wired later without touching callers.
    const channels = input.channels ?? ["in_app"];
    for (const channel of channels) {
      await db.insert(notificationDeliveries).values({
        notificationId: row.id,
        channel,
        sentAt: channel === "in_app" ? new Date() : null,
        metadata: channel === "in_app" ? null : { stub: true },
      });
    }

    return row.id;
  } catch (err) {
    logger.error("createNotification failed", {
      error: err instanceof Error ? err.message : String(err),
      input,
    });
    return null;
  }
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    );
}

/**
 * Mark all of a user's unread notifications as read.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}

/**
 * Get a user's recent notifications (read + unread, most recent first).
 */
export async function getUserNotifications(
  userId: string,
  limit = 50,
): Promise<Array<typeof notifications.$inferSelect>> {
  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Get unread count for a user — for the notification bell badge.
 */
export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return rows.length;
}
