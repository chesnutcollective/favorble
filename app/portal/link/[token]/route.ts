import "server-only";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { consumeMagicLink } from "@/lib/services/portal-magic-links";
import { insertPortalActivity } from "@/lib/services/portal-activity";
import { logger } from "@/lib/logger/server";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

function safeRedirectPath(path: string): string {
  // Only allow portal paths. A leaked token must never bounce to an
  // arbitrary URL.
  if (!path.startsWith("/portal")) return "/portal";
  return path;
}

/**
 * GET /portal/link/:token — magic-link redemption handler.
 *
 * Flow:
 *   1. Consume the token (atomic single-use + TTL check).
 *   2. If Clerk auth is enabled, mint a Clerk sign-in ticket for the
 *      contact's existing `portalUsers.authUserId` and redirect to the
 *      Clerk ticket URL, carrying `redirect_url=<path>`.
 *   3. In demo mode, set the same impersonation cookie the middleware
 *      understands so the portal renders as the claimant.
 *   4. Log a `portal_magic_link_followed` activity event.
 *
 * Failure modes all redirect to /portal (or /login) — we never surface the
 * raw reason so leaked links fail-safe.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const result = await consumeMagicLink(token);

  if (!result.ok) {
    const reason = result.reason;
    logger.info("portal magic link: rejected", { reason });
    const url = new URL(request.url);
    url.pathname = reason === "expired" ? "/login" : "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const redirectPath = safeRedirectPath(result.path);

  // Fire-and-forget activity event when we have a portal_user to link it to.
  if (result.portalUserId) {
    await insertPortalActivity({
      organizationId: result.organizationId,
      portalUserId: result.portalUserId,
      eventType: "portal_magic_link_followed",
      targetType: "portal_magic_link",
      metadata: { path: redirectPath },
    });
  }

  const url = new URL(request.url);
  url.pathname = redirectPath.split("?")[0];
  url.search = redirectPath.includes("?")
    ? redirectPath.slice(redirectPath.indexOf("?"))
    : "";

  // Demo / pre-Clerk mode: set the same impersonation cookie
  // middleware.ts reads so the layout renders the correct contact.
  if (!AUTH_ENABLED) {
    const response = NextResponse.redirect(url);
    response.cookies.set("favorble_portal_impersonate", result.contactId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/portal",
      maxAge: 60 * 60,
    });
    return response;
  }

  // Clerk path: mint a sign-in ticket for the existing auth user (if we
  // have one). If the invite hasn't been accepted yet we just redirect to
  // /login — the claimant will see their usual email/magic-link flow.
  if (!result.authUserId || result.authUserId.startsWith("pending_")) {
    const loginUrl = new URL(request.url);
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect_url", redirectPath);
    loginUrl.search = loginUrl.searchParams.toString();
    return NextResponse.redirect(loginUrl);
  }

  try {
    const clerk = await clerkClient();
    const ticket = await clerk.signInTokens.createSignInToken({
      userId: result.authUserId,
      expiresInSeconds: 60 * 10,
    });

    const signInUrl = new URL(request.url);
    signInUrl.pathname = "/login";
    signInUrl.search = "";
    signInUrl.searchParams.set("__clerk_ticket", ticket.token);
    signInUrl.searchParams.set("redirect_url", redirectPath);
    return NextResponse.redirect(signInUrl);
  } catch (error) {
    logger.error("portal magic link: clerk ticket creation failed", {
      error,
    });
    const loginUrl = new URL(request.url);
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect_url", redirectPath);
    return NextResponse.redirect(loginUrl);
  }
}
