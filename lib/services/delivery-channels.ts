import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Real-provider delivery channels for notifications.
 *
 * Uses plain `fetch()` against the Resend (email) and Twilio (SMS) REST
 * APIs so we don't take on SDK dependencies. Each function activates
 * automatically when its provider env vars are present and degrades
 * gracefully to a `{success: false, error}` stub when they aren't —
 * callers (notification-dispatcher.ts) persist the error on the
 * delivery row so we don't busy-retry the same failure forever.
 */

export type DeliveryInput = {
  notificationId: string;
  userId: string;
  channel: "in_app" | "email" | "sms" | "push";
  subject: string;
  body: string;
};

export type DeliveryResult = {
  success: boolean;
  externalId?: string;
  error?: string;
};

// ─────────────────────────────────────────────────────────────
// Email (Resend)
// ─────────────────────────────────────────────────────────────

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.email ?? null;
  } catch (err) {
    logger.error("getUserEmail failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Render plaintext body as minimal HTML. Line breaks become <br>,
 * paragraphs are separated by blank lines. No external templates or
 * MJML — keep this boring until we need more.
 */
function renderHtml(subject: string, body: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 12px 0;">${escape(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="font-size:18px;font-weight:600;margin:0 0 16px 0;">${escape(subject)}</h2>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eaeaea;margin:24px 0 12px 0;">
    <p style="font-size:12px;color:#8b8b97;margin:0;">Sent by Favorble</p>
  </body>
</html>`;
}

export async function deliverEmail(
  input: DeliveryInput,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const email = await getUserEmail(input.userId);
  if (!email) {
    return { success: false, error: "User email not found" };
  }

  const from = process.env.RESEND_FROM_EMAIL || "notifications@favorble.app";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: input.subject,
        html: renderHtml(input.subject, input.body),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Resend ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { success: true, externalId: data.id };
  } catch (err) {
    return {
      success: false,
      error: `Resend fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// SMS (Twilio)
// ─────────────────────────────────────────────────────────────

/**
 * Read the user's phone number. The `users` table schema (db/schema/users.ts)
 * does not declare a `phone` column today, so we fall back to a raw SQL
 * query and swallow the "column does not exist" error when the migration
 * hasn't been applied yet. Returns null when missing or unavailable.
 */
async function getUserPhone(userId: string): Promise<string | null> {
  try {
    const result = await db.execute<{ phone: string | null }>(
      sql`select phone from users where id = ${userId} limit 1`,
    );
    // postgres-js returns an array-like of rows
    const rows = Array.isArray(result)
      ? result
      : (result as unknown as { rows?: unknown[] }).rows;
    const first = (rows as Array<{ phone: string | null }> | undefined)?.[0];
    return first?.phone ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Column doesn't exist yet — graceful skip. Logged at info to avoid
    // polluting error dashboards.
    logger.info("getUserPhone unavailable (column likely missing)", {
      userId,
      error: message,
    });
    return null;
  }
}

export async function deliverSms(
  input: DeliveryInput,
): Promise<DeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return {
      success: false,
      error:
        "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not configured",
    };
  }

  const phone = await getUserPhone(input.userId);
  if (!phone) {
    return { success: false, error: "User phone not available" };
  }

  // Compose a compact SMS body. Include subject as a prefix when it fits,
  // then hard-truncate at 320 chars (2 standard SMS segments).
  const combined = input.subject
    ? `${input.subject}: ${input.body}`
    : input.body;
  const truncated =
    combined.length > 320 ? `${combined.slice(0, 317)}...` : combined;

  const form = new URLSearchParams();
  form.set("From", from);
  form.set("To", phone);
  form.set("Body", truncated);

  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Twilio ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as { sid?: string };
    return { success: true, externalId: data.sid };
  } catch (err) {
    return {
      success: false,
      error: `Twilio fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Push (stub)
// ─────────────────────────────────────────────────────────────

/**
 * Push notification stub. Wire to OneSignal / Web Push / APNs when the
 * mobile app ships.
 *
 * TODO(push): integrate OneSignal REST API (POST
 * https://onesignal.com/api/v1/notifications) using ONESIGNAL_APP_ID +
 * ONESIGNAL_API_KEY once the mobile client is in place.
 */
export async function deliverPush(
  input: DeliveryInput,
): Promise<DeliveryResult> {
  logger.info("deliverPush called (stub)", {
    notificationId: input.notificationId,
    userId: input.userId,
  });
  return { success: false, error: "Push not yet wired" };
}
