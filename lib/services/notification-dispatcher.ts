import "server-only";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  notifications,
  notificationDeliveries,
  notificationPreferences,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import {
  deliverEmail,
  deliverSms,
  deliverPush,
  type DeliveryInput,
  type DeliveryResult,
} from "@/lib/services/delivery-channels";

/**
 * Notification dispatcher. Walks the `notification_deliveries` rows for
 * a given notification and fires each pending (sentAt IS NULL) channel
 * through the appropriate provider.
 *
 * Behaviour:
 *  - `in_app` rows are already marked `sentAt` at creation time, so they
 *    are no-ops here.
 *  - A successful send stamps `sentAt` and `deliveredAt` + stores the
 *    provider's externalId in `metadata.externalId`.
 *  - A failed send stamps `sentAt` AND `errorMessage` — we deliberately
 *    set `sentAt` on failure so this dispatcher never retries the same
 *    stuck row. Retries are the caller's responsibility (separate
 *    escalation tier).
 *  - Respects `notification_preferences`: if email/sms/push is globally
 *    disabled OR the notification's `dedupe_key` prefix matches a muted
 *    event type, the corresponding delivery row is marked with a
 *    "muted by preferences" error and skipped.
 *  - `in_app` is never muted by preferences — users always get the bell.
 */

type NotificationRow = typeof notifications.$inferSelect;
type DeliveryRow = typeof notificationDeliveries.$inferSelect;
type PreferencesRow = typeof notificationPreferences.$inferSelect;

function isChannelMuted(
  channel: DeliveryRow["channel"],
  notification: NotificationRow,
  prefs: PreferencesRow | null,
): { muted: boolean; reason?: string } {
  if (channel === "in_app") return { muted: false };
  if (!prefs) return { muted: false };

  if (channel === "email" && !prefs.emailEnabled) {
    return { muted: true, reason: "Email disabled in preferences" };
  }
  if (channel === "sms" && !prefs.smsEnabled) {
    return { muted: true, reason: "SMS disabled in preferences" };
  }
  if (channel === "push" && !prefs.pushEnabled) {
    return { muted: true, reason: "Push disabled in preferences" };
  }

  // Event-type mute: dedupe_key typically encodes the event type as its
  // first colon-separated segment (e.g. "denial_received:case-123"). If
  // the notification has no dedupe_key, we can't mute by event type.
  if (notification.dedupeKey && prefs.mutedEventTypes) {
    const prefix = notification.dedupeKey.split(":")[0];
    if (prefix && prefs.mutedEventTypes.includes(prefix)) {
      return { muted: true, reason: `Event type "${prefix}" muted` };
    }
  }

  return { muted: false };
}

function deliveryFunctionFor(
  channel: DeliveryRow["channel"],
): ((input: DeliveryInput) => Promise<DeliveryResult>) | null {
  switch (channel) {
    case "email":
      return deliverEmail;
    case "sms":
      return deliverSms;
    case "push":
      return deliverPush;
    case "in_app":
      return null; // handled at create time
    default:
      return null;
  }
}

/**
 * Dispatch a single notification. Reads the notification + preferences,
 * fans out to each pending delivery channel, and persists the outcome.
 * Safe to call multiple times — already-sent rows (sentAt NOT NULL) are
 * left alone.
 */
export async function dispatchNotification(
  notificationId: string,
): Promise<void> {
  try {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notification) {
      logger.warn("dispatchNotification: notification not found", {
        notificationId,
      });
      return;
    }

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, notification.userId))
      .limit(1);

    const pending = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, notificationId),
          isNull(notificationDeliveries.sentAt),
        ),
      );

    for (const row of pending) {
      const fn = deliveryFunctionFor(row.channel);
      if (!fn) {
        // in_app or unknown — nothing to do
        continue;
      }

      const mute = isChannelMuted(row.channel, notification, prefs ?? null);
      if (mute.muted) {
        await db
          .update(notificationDeliveries)
          .set({
            sentAt: new Date(),
            errorMessage: mute.reason ?? "Muted by preferences",
          })
          .where(eq(notificationDeliveries.id, row.id));
        continue;
      }

      const result = await fn({
        notificationId,
        userId: notification.userId,
        channel: row.channel,
        subject: notification.title,
        body: notification.body,
      });

      const now = new Date();
      if (result.success) {
        await db
          .update(notificationDeliveries)
          .set({
            sentAt: now,
            deliveredAt: now,
            errorMessage: null,
            metadata: result.externalId
              ? { externalId: result.externalId }
              : null,
          })
          .where(eq(notificationDeliveries.id, row.id));
      } else {
        // Mark sentAt on failure too — prevents infinite retry loops on
        // a stuck row. A separate retry/escalation tier can reset this.
        await db
          .update(notificationDeliveries)
          .set({
            sentAt: now,
            errorMessage: result.error ?? "Unknown delivery failure",
          })
          .where(eq(notificationDeliveries.id, row.id));
        logger.warn("Notification channel delivery failed", {
          notificationId,
          channel: row.channel,
          error: result.error,
        });
      }
    }
  } catch (err) {
    logger.error("dispatchNotification failed", {
      notificationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Enqueue `dispatchNotification` to run after the current request has
 * flushed its response. Uses Next.js `after()` so the Lambda/worker
 * stays alive long enough for the provider fetches to complete without
 * blocking the upstream mutation.
 */
export function enqueueNotificationDispatch(notificationId: string): void {
  after(async () => {
    try {
      await dispatchNotification(notificationId);
    } catch (err) {
      logger.error("enqueueNotificationDispatch after() failed", {
        notificationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
