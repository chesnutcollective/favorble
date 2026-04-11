"use server";

import { db } from "@/db/drizzle";
import { notifications } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/services/notify";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Thin server-action wrappers around the notify service so the
 * notification bell (a client component) can fetch and mutate state
 * without needing an API route.
 */

export type ClientNotification = {
  id: string;
  title: string;
  body: string;
  priority: "info" | "normal" | "high" | "urgent";
  actionLabel: string | null;
  actionHref: string | null;
  caseId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

function serialize(row: typeof notifications.$inferSelect): ClientNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    actionLabel: row.actionLabel,
    actionHref: row.actionHref,
    caseId: row.caseId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function fetchMyNotifications(
  limit = 20,
): Promise<ClientNotification[]> {
  const session = await requireSession();
  const rows = await getUserNotifications(session.id, limit);
  return rows.map(serialize);
}

export async function fetchMyUnreadCount(): Promise<number> {
  const session = await requireSession();
  return await getUnreadNotificationCount(session.id);
}

export async function markRead(notificationId: string): Promise<void> {
  const session = await requireSession();
  await markNotificationRead(notificationId, session.id);
}

export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  await markAllNotificationsRead(session.id);
}

export async function dismissNotification(id: string): Promise<void> {
  const session = await requireSession();
  try {
    await db
      .update(notifications)
      .set({ dismissedAt: new Date() })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, session.id)),
      );
  } catch (err) {
    logger.error("dismissNotification failed", {
      error: err instanceof Error ? err.message : String(err),
      id,
    });
  }
}
