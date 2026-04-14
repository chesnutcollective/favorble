"use server";

import { cookies } from "next/headers";
import { db } from "@/db/drizzle";
import { documents } from "@/db/schema";
import {
  ensurePortalSession,
  getPortalRequestContext,
} from "@/lib/auth/portal-session";
import { insertPortalActivity } from "@/lib/services/portal-activity";
import { uploadDocumentToDefaultBackend } from "@/lib/storage/server";
import { enqueueDocumentProcessing } from "@/lib/services/enqueue-processing";
import { logger } from "@/lib/logger/server";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";

export type UploadPortalDocumentResult =
  | { success: true; documentId: string }
  | { error: string };

/**
 * Claimant-facing upload. Stores the file in the same bucket the firm uses
 * (Railway in prod/staging, Supabase in local dev), writes a `documents` row
 * scoped to the claimant's case, and schedules AI extraction via
 * enqueueDocumentProcessing so the firm side gets the same automatic
 * classification it gets for its own uploads.
 *
 * Impersonating staff cannot upload — the writer path is hard-blocked here
 * in addition to the client-side disabled state.
 */
export async function uploadPortalDocument(
  formData: FormData,
): Promise<UploadPortalDocumentResult> {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  if (session.isImpersonating) {
    return { error: "Uploads are disabled while previewing the portal." };
  }

  const file = formData.get("file");
  const caseIdRaw = formData.get("caseId");
  const orgIdRaw = formData.get("organizationId");

  if (!(file instanceof File)) {
    return { error: "Please choose a file to upload." };
  }
  if (typeof caseIdRaw !== "string" || !caseIdRaw) {
    return { error: "Your account isn't linked to a case yet." };
  }
  if (typeof orgIdRaw !== "string" || !orgIdRaw) {
    return { error: "Missing organization context." };
  }

  // Cross-verify that the caseId is one this claimant can actually see. We
  // trust the session.cases list over the form field — never blindly trust
  // client-supplied tenant data.
  const caseId = caseIdRaw;
  const knownCase = session.cases.find((c) => c.id === caseId);
  if (!knownCase) {
    return { error: "You can't upload to that case." };
  }
  const organizationId = session.portalUser.organizationId;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { storagePath } = await uploadDocumentToDefaultBackend(
      organizationId,
      caseId,
      file.name,
      buffer,
      file.type || "application/octet-stream",
    );

    // `source: case_status` is the existing enum value used for client-side
    // uploads (see components/documents/document-list.tsx source labels —
    // "case_status" renders as "Client Upload"). The free-text `category`
    // column also carries "client_upload" so firm-side filters can narrow.
    const [doc] = await db
      .insert(documents)
      .values({
        organizationId,
        caseId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        storagePath,
        category: "client_upload",
        source: "case_status",
        description: "Uploaded by claimant via the client portal",
        metadata: {
          portalUserId: session.portalUser.id,
          contactId: session.contact.id,
        },
        // createdBy intentionally null — this was not a firm user.
      })
      .returning();

    // Activity trail — the firm can see "Jane uploaded ID.pdf" in the
    // claimant's timeline.
    const { ip, userAgent } = await getPortalRequestContext();
    await insertPortalActivity({
      organizationId,
      portalUserId: session.portalUser.id,
      caseId,
      eventType: "upload_document",
      targetType: "document",
      targetId: doc.id,
      metadata: {
        fileName: doc.fileName,
        fileSizeBytes: doc.fileSizeBytes,
      },
      ip,
      userAgent,
    });

    // AI extraction — same path firm uploads take. Non-extractable file
    // types (images, audio, etc.) are skipped by the helper.
    enqueueDocumentProcessing({
      documentId: doc.id,
      organizationId,
      fileName: file.name,
      fileType: file.type,
      source: "portal_upload",
    });

    logger.info("Portal document uploaded", {
      documentId: doc.id,
      caseId,
      portalUserId: session.portalUser.id,
    });

    return { success: true, documentId: doc.id };
  } catch (error) {
    logger.error("Portal document upload failed", {
      caseId,
      error,
    });
    return { error: "We couldn't send that file. Please try again." };
  }
}
