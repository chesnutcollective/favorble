import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ensurePortalSession,
  getPortalRequestContext,
} from "@/lib/auth/portal-session";
import {
  getActiveShareForDownload,
  recordShareView,
} from "@/lib/services/portal-document-shares";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { getDocumentSignedUrl } from "@/lib/storage/server";
import { logger } from "@/lib/logger/server";

export const PORTAL_IMPERSONATE_COOKIE = "favorble_portal_impersonate";

/**
 * GET /api/portal/documents/[shareId]/download
 *
 * Portal-side download handler. Responsibilities:
 *   1. Verify the caller has an authenticated portal session (or a staff
 *      impersonation cookie — those are rejected below).
 *   2. Verify the share belongs to the current claimant and is still active
 *      (not revoked, not expired, document not soft-deleted).
 *   3. Record a document_share_views row with IP + user agent so the firm
 *      can see "did the claimant actually open this?".
 *   4. Log a `download_document` activity event.
 *   5. Redirect to the Railway / Supabase signed URL so the browser's
 *      native download sheet handles the transfer (we don't proxy the bytes
 *      through the Vercel function — it's cheaper, faster, and keeps large
 *      files off our bandwidth budget).
 *
 * Staff impersonating via ?impersonate=<contactId> are explicitly blocked
 * from this route — the UI disables the anchor, but we also refuse server-
 * side so a staff user can never accidentally stream a claimant's PHI via
 * the portal download path.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;

  const session = await ensurePortalSession({ impersonateContactId });

  if (session.isImpersonating) {
    // Staff must not download PHI via the portal path. Return a 403 JSON
    // so the client-side tooling surfaces the intent clearly if the UI
    // guard is ever bypassed.
    return NextResponse.json(
      { error: "Downloads are disabled while previewing the portal." },
      { status: 403 },
    );
  }

  const share = await getActiveShareForDownload(shareId, session.contact.id);
  if (!share) {
    return NextResponse.json(
      { error: "This file is no longer available." },
      { status: 404 },
    );
  }

  if (!share.canDownload) {
    return NextResponse.json(
      { error: "Download not permitted for this file." },
      { status: 403 },
    );
  }

  // Metadata-only stubs (Chronicle imports with no backing PDF) are marked
  // by a `chronicle://` storage_path. The signer throws for those at a
  // higher layer; catch early so we can return a helpful message.
  if (share.storagePath.startsWith("chronicle://")) {
    return NextResponse.json(
      {
        error:
          "This file is a placeholder with no attachment. Please ask your team to send the actual file.",
      },
      { status: 404 },
    );
  }

  // Record the view + activity before handing off to the signed URL — if
  // the signer throws we still want to know the user tried to download.
  const { ip, userAgent } = await getPortalRequestContext();
  await recordShareView({
    shareId: share.shareId,
    viewerIp: ip,
    userAgent: userAgent,
  });
  await logPortalActivity("download_document", "document", share.documentId, {
    shareId: share.shareId,
    fileName: share.fileName,
  });

  try {
    const signedUrl = await getDocumentSignedUrl(share.storagePath, 300);
    // 302 so the browser follows straight to the bucket. The signed URL
    // already carries a short expiry so an intercepted Referer log is
    // low-risk. Content-Disposition is enforced by the bucket response.
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err) {
    logger.error("portal download sign failed", {
      shareId,
      storagePath: share.storagePath,
      error: err,
    });
    // Don't leak storage internals in the response body.
    return NextResponse.json(
      { error: "This file is temporarily unavailable." },
      { status: 500 },
    );
  }
}
