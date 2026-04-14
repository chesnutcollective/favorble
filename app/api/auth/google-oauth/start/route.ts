import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import {
  buildAuthorizeUrl,
  hasOauthEnv,
} from "@/lib/integrations/google-oauth";
import { logger } from "@/lib/logger/server";

export const GOOGLE_OAUTH_STATE_COOKIE = "favorble_google_oauth_state";

/**
 * GET /api/auth/google-oauth/start
 *
 * Admin-only. Starts the Google Business Profile OAuth dance.
 *   1. Gates by session.role === 'admin'.
 *   2. Mints a CSRF token, stashes it in a short-lived cookie, bakes it
 *      plus the orgId into the `state` param.
 *   3. Redirects to Google's consent screen.
 *
 * When env vars are missing we bounce back to the admin config page with
 * ?error=not_configured so the UI can render a helpful hint.
 */
export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasOauthEnv()) {
    logger.warn("google oauth start: env not configured");
    return NextResponse.redirect(
      new URL(
        "/admin/integrations/google-reviews?error=not_configured",
        _request.url,
      ),
    );
  }

  const csrf = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ orgId: session.organizationId, csrf }),
    "utf8",
  ).toString("base64url");

  const authorizeUrl = buildAuthorizeUrl(state);
  if (!authorizeUrl) {
    return NextResponse.redirect(
      new URL(
        "/admin/integrations/google-reviews?error=not_configured",
        _request.url,
      ),
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return NextResponse.redirect(authorizeUrl);
}
