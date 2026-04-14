import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { googleOauthConnections, googleReviews } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  exchangeCodeForTokens,
  hasOauthEnv,
  listAccounts,
  listLocations,
  stripResourcePrefix,
} from "@/lib/integrations/google-oauth";
import { logger } from "@/lib/logger/server";
import { GOOGLE_OAUTH_STATE_COOKIE } from "../start/route";

/**
 * GET /api/auth/google-oauth/callback?code=...&state=...
 *
 * OAuth callback — exchanges the authorization code for tokens, resolves
 * the firm's GMB account + first location + Place ID, then upserts into
 * `google_oauth_connections`. Redirects back to the admin config page with
 * a banner parameter.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const adminPath = "/admin/integrations/google-reviews";

  if (oauthError) {
    logger.warn("google oauth callback: google returned error", {
      error: oauthError,
    });
    return NextResponse.redirect(
      new URL(`${adminPath}?error=${encodeURIComponent(oauthError)}`, request.url),
    );
  }

  if (!hasOauthEnv()) {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=not_configured`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=missing_params`, request.url),
    );
  }

  // Decode state and verify CSRF cookie.
  let orgId: string | null = null;
  let stateCsrf: string | null = null;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { orgId?: string; csrf?: string };
    orgId = parsed.orgId ?? null;
    stateCsrf = parsed.csrf ?? null;
  } catch {
    orgId = null;
  }
  if (!orgId || !stateCsrf) {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=invalid_state`, request.url),
    );
  }

  const cookieStore = await cookies();
  const cookieCsrf = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!cookieCsrf || cookieCsrf !== stateCsrf) {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=csrf_mismatch`, request.url),
    );
  }
  // One-shot: clear the CSRF cookie.
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  // Session + role gate (admin only).
  const session = await getSession();
  if (!session || session.organizationId !== orgId) {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=session_mismatch`, request.url),
    );
  }
  if (session.role !== "admin") {
    return NextResponse.redirect(
      new URL(`${adminPath}?error=forbidden`, request.url),
    );
  }

  // Exchange code → tokens.
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens?.access_token || !tokens?.refresh_token) {
    logger.error("google oauth callback: token exchange failed");
    return NextResponse.redirect(
      new URL(`${adminPath}?error=token_exchange_failed`, request.url),
    );
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  // Best-effort: resolve the first account + first location + place ID.
  // If the call fails or returns no accounts, we still save tokens — the
  // admin can re-sync manually later.
  let accountId: string | null = null;
  let locationId: string | null = null;
  let placeId: string | null = null;

  try {
    const accounts = await listAccounts(tokens.access_token);
    const firstAccount = accounts.accounts?.[0];
    if (firstAccount?.name) {
      accountId = stripResourcePrefix(firstAccount.name, "accounts");
      const locations = await listLocations(
        tokens.access_token,
        firstAccount.name,
      );
      const firstLocation = locations.locations?.[0];
      if (firstLocation?.name) {
        locationId = stripResourcePrefix(firstLocation.name, "locations");
        placeId = firstLocation.metadata?.placeId ?? null;
      }
    }
  } catch (err) {
    logger.warn("google oauth callback: account/location resolve failed", {
      error: err,
    });
  }

  // Seed the starting review count from whatever we've already imported
  // (will normally be 0 on a fresh connect).
  let startingCount = 0;
  try {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(googleReviews)
      .where(eq(googleReviews.organizationId, orgId));
    startingCount = Number(row?.count ?? 0);
  } catch {
    // ignore — default to 0
  }

  // Upsert connection row. Schema has `UNIQUE(organization_id)` so we use
  // onConflictDoUpdate to replace on re-connect.
  await db
    .insert(googleOauthConnections)
    .values({
      organizationId: orgId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      placeId,
      accountId,
      locationId,
      startingReviewCount: startingCount,
      connectedBy: session.id,
    })
    .onConflictDoUpdate({
      target: googleOauthConnections.organizationId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        placeId,
        accountId,
        locationId,
        connectedBy: session.id,
        connectedAt: new Date(),
      },
    });

  logger.info("google oauth callback: connected", {
    organizationId: orgId,
    hasAccount: accountId !== null,
    hasLocation: locationId !== null,
    hasPlaceId: placeId !== null,
  });

  return NextResponse.redirect(
    new URL(`${adminPath}?connected=1`, request.url),
  );
}
