import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { caseContacts, communications, contacts } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { buildMagicLink } from "@/lib/services/portal-magic-links";

/**
 * Portal SMS notifications.
 *
 * Each call mints a short-lived magic link (via `buildMagicLink`), injects
 * `{link}` into the body, and sends via the Twilio REST API using a narrow
 * `fetch` wrapper so we don't pull in the full `twilio` npm dependency.
 *
 * Degradation rules — in priority order:
 *   1. Missing contact / missing phone              → return { ok:false, skipped:'no_phone' }
 *   2. `contacts.smsOptOutAt` set                    → return { ok:false, skipped:'opted_out' },
 *                                                      do NOT hit Twilio
 *   3. Twilio env not configured                     → log-and-skip, return { ok:false, skipped:'not_configured' }
 *   4. Twilio HTTP error                             → log-and-return-error, return { ok:false }
 *
 * On success we ALWAYS write a `communications` row with
 * `type='sms_outbound'`, `sourceType='portal'`, `direction='outbound'`,
 * and the Twilio message SID stored in `externalMessageId`. This keeps the
 * unified inbox honest.
 *
 * HIPAA audit: every successful send AND every opt-out skip is logged so
 * auditors can answer "did the claimant ever get a stage-change SMS?".
 */

type PortalSmsCampaign =
  | "new_message"
  | "stage_change"
  | "appointment_reminder"
  | "invite"
  | "generic";

export type SendPortalSmsInput = {
  /** Contact to send to. Phone is loaded from `contacts.phone`. */
  contactId: string;
  /**
   * Body template. If it contains the literal string `{link}` we mint a
   * magic link and substitute it in. When `linkPath` is omitted, `{link}`
   * is stripped from the body.
   */
  body: string;
  /** Relative portal path to deep-link to (e.g. '/portal/messages'). */
  linkPath?: string;
  /** Campaign tag for analytics + HIPAA audit trail. */
  campaign: PortalSmsCampaign;
  /** Optional associated case (attaches to the communications row). */
  caseId?: string | null;
};

export type SendPortalSmsResult =
  | {
      ok: true;
      communicationId: string;
      twilioSid: string | null;
      linkUrl: string | null;
    }
  | {
      ok: false;
      skipped?: "no_phone" | "opted_out" | "not_configured";
      error?: string;
    };

type TwilioCreds = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

function loadTwilioCreds(): TwilioCreds | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

async function sendViaTwilio(
  creds: TwilioCreds,
  to: string,
  body: string,
): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const basic = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString(
    "base64",
  );
  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", creds.fromNumber);
  form.set("Body", body);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `twilio_http_${response.status}: ${text}` };
    }
    const data = (await response.json()) as { sid?: string };
    return { ok: true, sid: data.sid ?? "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolvePrimaryCaseIdForContact(
  contactId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ caseId: caseContacts.caseId })
      .from(caseContacts)
      .where(eq(caseContacts.contactId, contactId))
      .limit(1);
    return row?.caseId ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a portal SMS to a claimant. See module docstring for the degradation
 * contract. Callers should NOT throw on a non-ok result — it's expected for
 * opted-out or unconfigured environments.
 */
export async function sendPortalSms(
  contactId: string,
  body: string,
  opts: { linkPath?: string; campaign: PortalSmsCampaign; caseId?: string | null },
): Promise<SendPortalSmsResult> {
  if (!contactId) return { ok: false, error: "Missing contactId" };
  if (!body) return { ok: false, error: "Missing body" };

  const [contact] = await db
    .select({
      id: contacts.id,
      organizationId: contacts.organizationId,
      phone: contacts.phone,
      smsOptOutAt: contacts.smsOptOutAt,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) return { ok: false, error: "Contact not found" };

  if (!contact.phone) {
    logger.info("portal sms: skipped — no phone on file", {
      contactId,
      campaign: opts.campaign,
    });
    return { ok: false, skipped: "no_phone" };
  }

  if (contact.smsOptOutAt) {
    logger.info("portal sms: skipped — opted out", {
      contactId,
      campaign: opts.campaign,
      optedOutAt: contact.smsOptOutAt.toISOString(),
    });
    await logPhiModification({
      organizationId: contact.organizationId,
      userId: null,
      entityType: "portal_sms",
      entityId: contact.id,
      operation: "create",
      action: "portal_sms_suppressed_opt_out",
      metadata: {
        campaign: opts.campaign,
        linkPath: opts.linkPath ?? null,
      },
    });
    return { ok: false, skipped: "opted_out" };
  }

  // Mint the magic link (if requested) and substitute `{link}`.
  let linkUrl: string | null = null;
  if (opts.linkPath) {
    const result = await buildMagicLink({
      contactId: contact.id,
      path: opts.linkPath,
      campaign: opts.campaign,
    });
    if (result.ok && result.url) {
      linkUrl = result.url;
    } else {
      logger.warn("portal sms: magic link creation failed — sending body only", {
        contactId,
        campaign: opts.campaign,
        error: result.error,
      });
    }
  }
  const finalBody = body.includes("{link}")
    ? body.replace(/{link}/g, linkUrl ?? "")
    : body + (linkUrl ? ` ${linkUrl}` : "");
  const trimmedBody = finalBody.replace(/\s+$/g, "");

  const creds = loadTwilioCreds();
  let twilioSid: string | null = null;
  let sendError: string | null = null;
  if (!creds) {
    logger.warn("portal sms: twilio not configured — logging only", {
      contactId,
      campaign: opts.campaign,
    });
    sendError = "not_configured";
  } else {
    const result = await sendViaTwilio(creds, contact.phone, trimmedBody);
    if (result.ok) {
      twilioSid = result.sid || null;
    } else {
      sendError = result.error;
      logger.error("portal sms: twilio send failed", {
        contactId,
        campaign: opts.campaign,
        error: result.error,
      });
    }
  }

  // Resolve associated case so the unified inbox shows the SMS on the case.
  const caseId =
    opts.caseId ?? (await resolvePrimaryCaseIdForContact(contact.id));

  // Best-effort persist. Even when Twilio wasn't configured / failed we
  // still want an audit record of what we TRIED to send.
  let communicationId: string | null = null;
  try {
    const [row] = await db
      .insert(communications)
      .values({
        organizationId: contact.organizationId,
        caseId: caseId ?? null,
        type: "sms_outbound",
        direction: "outbound",
        body: trimmedBody,
        toAddress: contact.phone,
        externalMessageId: twilioSid,
        sourceSystem: "twilio",
        sourceType: "portal",
        metadata: {
          campaign: opts.campaign,
          linkPath: opts.linkPath ?? null,
          linkUrl,
          skipped: !creds,
          error: sendError,
        },
      })
      .returning({ id: communications.id });
    communicationId = row.id;
  } catch (error) {
    logger.error("portal sms: communications insert failed", {
      contactId,
      error,
    });
  }

  await logPhiModification({
    organizationId: contact.organizationId,
    userId: null,
    entityType: "portal_sms",
    entityId: communicationId ?? contact.id,
    caseId: caseId ?? null,
    operation: "create",
    action: sendError ? "portal_sms_attempt_failed" : "portal_sms_sent",
    metadata: {
      campaign: opts.campaign,
      twilioSid,
      linkPath: opts.linkPath ?? null,
      error: sendError,
      communicationId,
    },
  });

  if (sendError === "not_configured") {
    return { ok: false, skipped: "not_configured" };
  }
  if (sendError) {
    return { ok: false, error: sendError };
  }
  if (!communicationId) {
    return { ok: false, error: "Failed to persist communications row" };
  }

  return {
    ok: true,
    communicationId,
    twilioSid,
    linkUrl,
  };
}

// ─────────────────────────────────────────────────────────────
// Body templates — English + Spanish (es). The portal uses the
// contact's `preferredLocale` to pick a template.
// ─────────────────────────────────────────────────────────────

type Locale = "en" | "es";

function localeFor(preferredLocale: string | null | undefined): Locale {
  return preferredLocale?.toLowerCase() === "es" ? "es" : "en";
}

const NEW_MESSAGE_BODIES: Record<Locale, string> = {
  en: "You have a new message from Hogan Smith Law. Open: {link}",
  es: "Tienes un mensaje nuevo de Hogan Smith Law. Abrir: {link}",
};

const APPOINTMENT_REMINDER_BODIES: Record<Locale, (title: string) => string> = {
  en: (title) =>
    `Reminder: ${title} is tomorrow. Open your case portal to see details: {link}`,
  es: (title) =>
    `Recordatorio: ${title} es mañana. Abre tu portal del caso para ver detalles: {link}`,
};

function stageChangeBody(
  locale: Locale,
  stageName: string | null,
): string {
  const name = stageName ?? "";
  if (locale === "es") {
    return name
      ? `Novedades en tu caso: ahora está en "${name}". Abrir tu portal: {link}`
      : "Tu caso pasó a una nueva etapa. Abrir tu portal: {link}";
  }
  return name
    ? `Case update: you're now in "${name}". Open your portal: {link}`
    : "Your case moved to a new stage. Open your portal: {link}";
}

export async function notifyNewMessage(params: {
  contactId: string;
  caseId?: string | null;
  preferredLocale?: string | null;
}): Promise<SendPortalSmsResult> {
  const locale = localeFor(params.preferredLocale);
  return sendPortalSms(params.contactId, NEW_MESSAGE_BODIES[locale], {
    linkPath: "/portal/messages",
    campaign: "new_message",
    caseId: params.caseId ?? null,
  });
}

export async function notifyStageChange(params: {
  contactId: string;
  caseId?: string | null;
  stageName: string | null;
  preferredLocale?: string | null;
}): Promise<SendPortalSmsResult> {
  const locale = localeFor(params.preferredLocale);
  return sendPortalSms(
    params.contactId,
    stageChangeBody(locale, params.stageName),
    {
      linkPath: "/portal",
      campaign: "stage_change",
      caseId: params.caseId ?? null,
    },
  );
}

/**
 * Stub entry point for the 24h-before appointment reminder cron. The cron
 * worker itself is out of scope for this wave; this function is the
 * callable surface a future worker will invoke per calendar event.
 */
export async function sendAppointmentReminder(params: {
  contactId: string;
  caseId?: string | null;
  appointmentTitle: string;
  preferredLocale?: string | null;
}): Promise<SendPortalSmsResult> {
  const locale = localeFor(params.preferredLocale);
  const body = APPOINTMENT_REMINDER_BODIES[locale](params.appointmentTitle);
  return sendPortalSms(params.contactId, body, {
    linkPath: "/portal/appointments",
    campaign: "appointment_reminder",
    caseId: params.caseId ?? null,
  });
}
