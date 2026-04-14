import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  caseContacts,
  cases,
  contacts,
  googleOauthConnections,
  organizations,
  reviewRequests,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { sendPortalSms } from "@/lib/services/portal-sms";

/**
 * Auto-request-on-close orchestrator.
 *
 * Invariants — this is fire-and-forget from `closeCase` so every branch has
 * to be safe to swallow:
 *   - Only fires when the org has a `google_oauth_connections` row.
 *   - Only fires when `organizations.settings.googleReviews.autoRequest`
 *     is true.
 *   - Skips if we've already written a `review_requests` row for this case
 *     (idempotent against stage-change fan-out).
 *   - Chooses channel: SMS if phone, else email (logged-only for now),
 *     else portal-only.
 *   - Interpolates `{caseNumber}`, `{claimantFirstName}`, `{shortUrl}` from
 *     the template. `organizations.review_request_template` wins, else the
 *     built-in English default.
 */

const DEFAULT_TEMPLATE =
  "Hi {claimantFirstName}, thank you for trusting us with your case " +
  "{caseNumber}. If you have a minute, we'd really appreciate a Google " +
  "review: {shortUrl}";

function buildGoogleReviewUrl(placeId: string | null): string | null {
  if (!placeId) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

function interpolate(
  template: string,
  vars: { caseNumber: string; claimantFirstName: string; shortUrl: string },
): string {
  return template
    .replace(/\{caseNumber\}/g, vars.caseNumber)
    .replace(/\{claimantFirstName\}/g, vars.claimantFirstName)
    .replace(/\{shortUrl\}/g, vars.shortUrl);
}

export type AutoReviewRequestResult =
  | { ok: true; requestId: string; channel: "sms" | "email" | "in_portal" }
  | {
      ok: false;
      reason:
        | "not_connected"
        | "disabled"
        | "already_sent"
        | "no_primary_contact"
        | "no_case"
        | "error";
      error?: string;
    };

type OrgSettingsReviews = {
  googleReviews?: { autoRequest?: boolean };
};

export async function maybeSendAutoReviewRequest(params: {
  caseId: string;
  organizationId: string;
  userId: string;
}): Promise<AutoReviewRequestResult> {
  try {
    // 1. OAuth connection must exist.
    const [connection] = await db
      .select({
        placeId: googleOauthConnections.placeId,
      })
      .from(googleOauthConnections)
      .where(
        eq(googleOauthConnections.organizationId, params.organizationId),
      )
      .limit(1);

    if (!connection) {
      return { ok: false, reason: "not_connected" };
    }

    // 2. Org must have auto-request enabled.
    const [org] = await db
      .select({
        settings: organizations.settings,
        reviewRequestTemplate: organizations.reviewRequestTemplate,
      })
      .from(organizations)
      .where(eq(organizations.id, params.organizationId))
      .limit(1);

    const settings = (org?.settings ?? {}) as OrgSettingsReviews;
    if (!settings.googleReviews?.autoRequest) {
      return { ok: false, reason: "disabled" };
    }

    // 3. Has this case already been asked? Look for any prior request row.
    const [existingRequest] = await db
      .select({ id: reviewRequests.id })
      .from(reviewRequests)
      .where(
        and(
          eq(reviewRequests.caseId, params.caseId),
          eq(reviewRequests.organizationId, params.organizationId),
        ),
      )
      .limit(1);
    if (existingRequest) {
      return { ok: false, reason: "already_sent" };
    }

    // 4. Resolve case + primary contact.
    const [caseRow] = await db
      .select({
        caseNumber: cases.caseNumber,
      })
      .from(cases)
      .where(
        and(
          eq(cases.id, params.caseId),
          eq(cases.organizationId, params.organizationId),
        ),
      )
      .limit(1);
    if (!caseRow) {
      return { ok: false, reason: "no_case" };
    }

    const [primary] = await db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        email: contacts.email,
        phone: contacts.phone,
        preferredLocale: contacts.preferredLocale,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(contacts.id, caseContacts.contactId))
      .where(
        and(
          eq(caseContacts.caseId, params.caseId),
          eq(caseContacts.isPrimary, true),
        ),
      )
      .limit(1);

    if (!primary) {
      return { ok: false, reason: "no_primary_contact" };
    }

    // 5. Decide channel.
    const channel: "sms" | "email" | "in_portal" = primary.phone
      ? "sms"
      : primary.email
        ? "email"
        : "in_portal";

    // 6. Build body.
    const reviewUrl = buildGoogleReviewUrl(connection.placeId) ?? "";
    const template = org?.reviewRequestTemplate ?? DEFAULT_TEMPLATE;
    const body = interpolate(template, {
      caseNumber: caseRow.caseNumber,
      claimantFirstName: primary.firstName ?? "",
      shortUrl: reviewUrl,
    });

    // 7. Write the review_requests row FIRST so we have an audit trail
    //    regardless of delivery outcome.
    const [created] = await db
      .insert(reviewRequests)
      .values({
        organizationId: params.organizationId,
        caseId: params.caseId,
        contactId: primary.contactId,
        channel,
        createdBy: params.userId,
      })
      .returning({ id: reviewRequests.id });

    // 8. Dispatch. For SMS we reuse portal-sms (Twilio-gated — degrades
    //    to "not_configured" when env is missing). Email/portal paths are
    //    logged only for now; full implementations are pending.
    if (channel === "sms" && primary.phone) {
      const smsResult = await sendPortalSms(primary.contactId, body, {
        campaign: "generic",
        caseId: params.caseId,
      });
      if (smsResult.ok) {
        await db
          .update(reviewRequests)
          .set({ sentAt: new Date() })
          .where(eq(reviewRequests.id, created.id));
      } else {
        logger.info("auto review request: sms deferred", {
          caseId: params.caseId,
          reason: smsResult.skipped ?? smsResult.error,
        });
      }
    } else if (channel === "email") {
      // TODO: wire through the same email service that sends portal
      // invites once it lands. For now log + still record the row as
      // intent-only; a follow-up can backfill `sent_at`.
      logger.info("auto review request: email channel pending", {
        caseId: params.caseId,
        email: primary.email ? "<redacted>" : null,
      });
    } else {
      logger.info("auto review request: portal-only (no contactable channel)", {
        caseId: params.caseId,
      });
    }

    logger.info("auto review request: created", {
      requestId: created.id,
      caseId: params.caseId,
      channel,
    });

    return { ok: true, requestId: created.id, channel };
  } catch (err) {
    logger.error("auto review request: unexpected error", {
      caseId: params.caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
