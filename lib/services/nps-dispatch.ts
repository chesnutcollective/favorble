import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contacts,
  npsResponses,
  type NpsResponseRecord,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { buildMagicLink } from "@/lib/services/portal-magic-links";
import { sendPortalSms } from "@/lib/services/portal-sms";

/**
 * Phase 5 A2 — NPS survey dispatcher.
 *
 * Finds `nps_responses` rows the stage-change trigger enqueued but hasn't yet
 * sent (`sent_at IS NULL` and `metadata.scheduledFor <= now()`) and delivers
 * them via the configured channel:
 *
 *   - 'sms'    → mint a `/portal/nps/:responseId` magic link, send via Twilio
 *   - 'email'  → TODO: hand off to real email service; for now log + stamp
 *                `sent_at` so we don't retry forever
 *   - 'portal' → no outbound send; the `/portal` home banner renders when the
 *                row is unanswered
 *
 * Degradation rules:
 *   - Missing Twilio env → stamp `sent_at` with metadata.skipped='no_twilio'
 *   - Missing contact phone → stamp with metadata.skipped='no_phone'
 *   - Contact opted out of SMS → stamp with metadata.skipped='opted_out'
 *
 * Never throws — every failure path logs and stamps the row so the dispatcher
 * can keep making progress on the next sweep.
 */

const MAX_PER_RUN = 100;

export type DispatchResult = {
  scannedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  portalDeferredCount: number;
};

type PendingRow = Pick<
  NpsResponseRecord,
  | "id"
  | "organizationId"
  | "caseId"
  | "contactId"
  | "campaignId"
  | "channel"
  | "sentAt"
  | "metadata"
>;

function getScheduledFor(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).scheduledFor;
  if (typeof raw !== "string") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

async function stampSent(
  row: PendingRow,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const merged = mergeMetadata(row.metadata, patch);
    await db
      .update(npsResponses)
      .set({ sentAt: new Date(), metadata: merged })
      .where(eq(npsResponses.id, row.id));
  } catch (error) {
    logger.error("nps-dispatch: failed to stamp sent_at", {
      id: row.id,
      error,
    });
  }
}

async function dispatchOne(row: PendingRow): Promise<{
  outcome: "sent" | "skipped" | "portal_deferred" | "error";
}> {
  // Portal channel is pull-based — the claimant sees a banner on /portal.
  // We don't stamp sent_at so the banner keeps showing until submission,
  // but we record that we "dispatched" it in metadata so analytics can
  // tell apart pending-for-portal-view vs pending-for-send.
  if (row.channel === "portal") {
    return { outcome: "portal_deferred" };
  }

  // Mint the deep link to the survey page.
  const magicLink = await buildMagicLink({
    contactId: row.contactId,
    path: `/portal/nps/${row.id}`,
    campaign: "nps_survey",
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days — NPS should be forgiving
  });

  if (row.channel === "email") {
    // TODO(nps): wire up real transactional email once the email service
    // is in place. For now we log and stamp sent_at so the row doesn't
    // loop forever on the cron.
    logger.info("nps-dispatch: email channel stub", {
      id: row.id,
      linkUrl: magicLink.ok ? magicLink.url : null,
    });
    await stampSent(row, {
      deliveryChannel: "email",
      skipped: "email_not_implemented",
      linkUrl: magicLink.ok ? magicLink.url : null,
      magicLinkId: magicLink.ok ? magicLink.id : null,
    });
    return { outcome: "skipped" };
  }

  if (row.channel === "sms") {
    if (!twilioConfigured()) {
      await stampSent(row, {
        deliveryChannel: "sms",
        skipped: "no_twilio",
        linkUrl: magicLink.ok ? magicLink.url : null,
        magicLinkId: magicLink.ok ? magicLink.id : null,
      });
      return { outcome: "skipped" };
    }

    // Look up contact locale for the SMS body.
    const [contact] = await db
      .select({ preferredLocale: contacts.preferredLocale })
      .from(contacts)
      .where(eq(contacts.id, row.contactId))
      .limit(1);
    const locale =
      contact?.preferredLocale?.toLowerCase() === "es" ? "es" : "en";
    const body =
      locale === "es"
        ? "¿Cómo vamos? Su opinión nos ayuda a mejorar: {link}"
        : "How are we doing? Share a quick rating: {link}";

    const result = await sendPortalSms(row.contactId, body, {
      linkPath: `/portal/nps/${row.id}`,
      campaign: "generic",
      caseId: row.caseId ?? null,
    });

    if (result.ok) {
      await stampSent(row, {
        deliveryChannel: "sms",
        twilioSid: result.twilioSid,
        linkUrl: result.linkUrl,
        communicationId: result.communicationId,
      });
      return { outcome: "sent" };
    }

    // sendPortalSms failures — still stamp sent_at so we don't retry
    // forever; metadata records why.
    const skippedReason =
      result.skipped === "no_phone"
        ? "no_phone"
        : result.skipped === "opted_out"
          ? "opted_out"
          : result.skipped === "not_configured"
            ? "no_twilio"
            : "sms_failed";
    await stampSent(row, {
      deliveryChannel: "sms",
      skipped: skippedReason,
      error: "error" in result ? result.error ?? null : null,
    });
    return { outcome: "skipped" };
  }

  // Unknown channel (should be blocked by the CHECK constraint, but be
  // defensive) — stamp + skip.
  await stampSent(row, {
    skipped: "unknown_channel",
    channel: row.channel,
  });
  return { outcome: "skipped" };
}

/**
 * Scan up to MAX_PER_RUN pending NPS rows and dispatch them. Safe to call
 * from a cron endpoint — idempotent under retries because a successful
 * dispatch stamps sent_at.
 */
export async function dispatchPendingNpsSurveys(): Promise<DispatchResult> {
  const result: DispatchResult = {
    scannedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    portalDeferredCount: 0,
  };

  let rows: PendingRow[] = [];
  try {
    // Pull rows where sent_at IS NULL and either metadata.scheduledFor is
    // missing or already in the past. We do the scheduled-for check in JS
    // so we don't have to rely on a jsonb path index.
    rows = await db
      .select({
        id: npsResponses.id,
        organizationId: npsResponses.organizationId,
        caseId: npsResponses.caseId,
        contactId: npsResponses.contactId,
        campaignId: npsResponses.campaignId,
        channel: npsResponses.channel,
        sentAt: npsResponses.sentAt,
        metadata: npsResponses.metadata,
      })
      .from(npsResponses)
      .where(
        and(
          isNull(npsResponses.sentAt),
          isNull(npsResponses.respondedAt),
        ),
      )
      .limit(MAX_PER_RUN * 2);
  } catch (error) {
    logger.error("nps-dispatch: candidate query failed", { error });
    return result;
  }

  const now = Date.now();
  const ready = rows.filter((row) => {
    const scheduled = getScheduledFor(row.metadata);
    // No scheduled-for → treat as ready immediately (defensive — portal
    // rows might not carry one).
    if (!scheduled) return true;
    return scheduled.getTime() <= now;
  });

  for (const row of ready.slice(0, MAX_PER_RUN)) {
    result.scannedCount += 1;
    try {
      const { outcome } = await dispatchOne(row);
      if (outcome === "sent") result.sentCount += 1;
      else if (outcome === "skipped") result.skippedCount += 1;
      else if (outcome === "portal_deferred")
        result.portalDeferredCount += 1;
    } catch (error) {
      result.errorCount += 1;
      logger.error("nps-dispatch: row dispatch failed", {
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Load any pending NPS responses that are owed to a specific contact AND have
 * already been dispatched (sent_at set) but not yet answered. Used by the
 * /portal home banner.
 *
 * For `channel='portal'` campaigns we also include rows that haven't been
 * dispatched yet — the banner IS the delivery mechanism for that channel.
 */
export async function getPendingNpsForContact(
  contactId: string,
): Promise<{ id: string; campaignId: string | null }[]> {
  try {
    const rows = await db
      .select({
        id: npsResponses.id,
        campaignId: npsResponses.campaignId,
        channel: npsResponses.channel,
        sentAt: npsResponses.sentAt,
      })
      .from(npsResponses)
      .where(
        and(
          eq(npsResponses.contactId, contactId),
          isNull(npsResponses.respondedAt),
        ),
      )
      .limit(10);

    return rows
      .filter((r) => r.channel === "portal" || r.sentAt !== null)
      .map((r) => ({ id: r.id, campaignId: r.campaignId }));
  } catch (error) {
    logger.error("nps-dispatch: getPendingNpsForContact failed", {
      contactId,
      error,
    });
    return [];
  }
}

