import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { googleOauthConnections, googleReviews } from "@/db/schema";
import {
  listReviews,
  refreshAccessToken,
  starRatingToInt,
  type GoogleReviewApi,
} from "@/lib/integrations/google-oauth";
import { logger } from "@/lib/logger/server";

/**
 * Pull the latest review set from Google and upsert into `google_reviews`.
 *
 * Degradation:
 *   - No connection row          → { ok:false, reason:'not_connected' }
 *   - Missing account/location   → { ok:false, reason:'incomplete_connection' }
 *   - Token refresh fails        → { ok:false, reason:'auth_failed' }
 *   - API call fails             → { ok:false, reason:'api_error' }
 *
 * On success, updates `last_sync_at` on the connection row.
 */
export type SyncResult =
  | {
      ok: true;
      fetched: number;
      inserted: number;
      updated: number;
    }
  | {
      ok: false;
      reason:
        | "not_connected"
        | "incomplete_connection"
        | "auth_failed"
        | "api_error";
      error?: string;
    };

const REFRESH_BUFFER_MS = 60 * 1000; // refresh if <60s to expiry

async function getValidAccessToken(
  connection: typeof googleOauthConnections.$inferSelect,
): Promise<string | null> {
  const now = Date.now();
  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
  if (expiresAt && expiresAt - now > REFRESH_BUFFER_MS) {
    return connection.accessToken;
  }

  const refreshed = await refreshAccessToken(connection.refreshToken);
  if (!refreshed?.access_token) return null;

  const newExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000)
    : null;

  await db
    .update(googleOauthConnections)
    .set({
      accessToken: refreshed.access_token,
      tokenExpiresAt: newExpiresAt,
    })
    .where(eq(googleOauthConnections.id, connection.id));

  return refreshed.access_token;
}

export async function syncGoogleReviews(
  organizationId: string,
): Promise<SyncResult> {
  const [connection] = await db
    .select()
    .from(googleOauthConnections)
    .where(eq(googleOauthConnections.organizationId, organizationId))
    .limit(1);

  if (!connection) {
    return { ok: false, reason: "not_connected" };
  }
  if (!connection.accountId || !connection.locationId) {
    return { ok: false, reason: "incomplete_connection" };
  }

  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    return { ok: false, reason: "auth_failed" };
  }

  let inserted = 0;
  let updated = 0;
  let fetched = 0;
  let pageToken: string | undefined;

  try {
    // Paginate — typical firms have <100 reviews so this usually runs once.
    do {
      const response = await listReviews(
        accessToken,
        connection.accountId,
        connection.locationId,
        pageToken,
      );
      const reviews: GoogleReviewApi[] = response.reviews ?? [];
      fetched += reviews.length;

      for (const r of reviews) {
        if (!r.reviewId) continue;
        const rating = starRatingToInt(r.starRating);
        if (rating < 1) continue;
        const postedAt = r.createTime ? new Date(r.createTime) : new Date();
        const respondedAt = r.reviewReply?.updateTime
          ? new Date(r.reviewReply.updateTime)
          : null;

        // Upsert on (organization_id, external_review_id). external_review_id
        // has its own unique index from migration 0021.
        const [existing] = await db
          .select({ id: googleReviews.id })
          .from(googleReviews)
          .where(
            and(
              eq(googleReviews.organizationId, organizationId),
              eq(googleReviews.externalReviewId, r.reviewId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(googleReviews)
            .set({
              reviewerName: r.reviewer?.displayName ?? null,
              rating,
              comment: r.comment ?? null,
              postedAt,
              respondedAt,
              response: r.reviewReply?.comment ?? null,
              fetchedAt: new Date(),
            })
            .where(eq(googleReviews.id, existing.id));
          updated++;
        } else {
          await db.insert(googleReviews).values({
            organizationId,
            placeId: connection.placeId ?? "",
            externalReviewId: r.reviewId,
            reviewerName: r.reviewer?.displayName ?? null,
            rating,
            comment: r.comment ?? null,
            postedAt,
            respondedAt,
            response: r.reviewReply?.comment ?? null,
          });
          inserted++;
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  } catch (err) {
    logger.error("google reviews sync: api call failed", {
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await db
    .update(googleOauthConnections)
    .set({ lastSyncAt: new Date() })
    .where(eq(googleOauthConnections.id, connection.id));

  logger.info("google reviews sync: complete", {
    organizationId,
    fetched,
    inserted,
    updated,
  });

  return { ok: true, fetched, inserted, updated };
}
