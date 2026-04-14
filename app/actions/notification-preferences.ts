"use server";

import { db } from "@/db/drizzle";
import { notificationPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

/**
 * Server actions for the per-user notification preferences UI at
 * /settings/notifications. Reads + upserts the single preferences row
 * keyed by user_id (unique).
 */

export type NotificationPreferencesDTO = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  mutedEventTypes: string[];
};

export async function getMyNotificationPreferences(): Promise<NotificationPreferencesDTO> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, session.id))
      .limit(1);

    if (row) {
      return {
        emailEnabled: row.emailEnabled,
        smsEnabled: row.smsEnabled,
        pushEnabled: row.pushEnabled,
        mutedEventTypes: row.mutedEventTypes ?? [],
      };
    }

    // First visit — create a default row so subsequent saves can use
    // the unique constraint as a natural upsert target.
    await db
      .insert(notificationPreferences)
      .values({ userId: session.id })
      .onConflictDoNothing();

    return {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      mutedEventTypes: [],
    };
  } catch (err) {
    logger.error("getMyNotificationPreferences failed", {
      userId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      mutedEventTypes: [],
    };
  }
}

export async function updateMyNotificationPreferences(
  input: NotificationPreferencesDTO,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  try {
    await db
      .insert(notificationPreferences)
      .values({
        userId: session.id,
        emailEnabled: input.emailEnabled,
        smsEnabled: input.smsEnabled,
        pushEnabled: input.pushEnabled,
        mutedEventTypes: input.mutedEventTypes,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          emailEnabled: input.emailEnabled,
          smsEnabled: input.smsEnabled,
          pushEnabled: input.pushEnabled,
          mutedEventTypes: input.mutedEventTypes,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/settings/notifications");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("updateMyNotificationPreferences failed", {
      userId: session.id,
      error: message,
    });
    return { ok: false, error: message };
  }
}
