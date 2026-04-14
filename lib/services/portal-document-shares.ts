import "server-only";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  documents,
  documentShares,
  documentShareViews,
  users,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";

/**
 * E4 — portal-side loaders for the claimant's "Documents" screen and the
 * download route handler. These are NOT server actions: they're plain
 * service helpers callable from server components + route handlers, scoped
 * to a specific contact (which the caller has already auth'd via
 * ensurePortalSession).
 */

export type PortalSharedDocument = {
  shareId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  category: string | null;
  canDownload: boolean;
  sharedAt: string;
  expiresAt: string | null;
  sharedByName: string | null;
  isMetadataOnly: boolean;
};

/**
 * Load every document share visible to the given contact RIGHT NOW.
 * Filters out revoked + expired rows in SQL.
 */
export async function listActiveSharesForContact(
  contactId: string,
): Promise<PortalSharedDocument[]> {
  try {
    const now = new Date();
    const rows = await db
      .select({
        shareId: documentShares.id,
        documentId: documents.id,
        fileName: documents.fileName,
        fileType: documents.fileType,
        fileSizeBytes: documents.fileSizeBytes,
        category: documents.category,
        canDownload: documentShares.canDownload,
        sharedAt: documentShares.createdAt,
        expiresAt: documentShares.expiresAt,
        storagePath: documents.storagePath,
        sharedByFirstName: users.firstName,
        sharedByLastName: users.lastName,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documents.id, documentShares.documentId))
      .leftJoin(users, eq(users.id, documentShares.createdBy))
      .where(
        and(
          eq(documentShares.sharedWithContactId, contactId),
          isNull(documentShares.revokedAt),
          isNull(documents.deletedAt),
          or(
            isNull(documentShares.expiresAt),
            gt(documentShares.expiresAt, now),
          ),
        ),
      )
      .orderBy(desc(documentShares.createdAt));

    return rows.map((r) => {
      const sharedByName = r.sharedByFirstName
        ? `${r.sharedByFirstName} ${r.sharedByLastName ?? ""}`.trim()
        : null;
      return {
        shareId: r.shareId,
        documentId: r.documentId,
        fileName: r.fileName,
        fileType: r.fileType,
        fileSizeBytes: r.fileSizeBytes,
        category: r.category,
        canDownload: r.canDownload,
        sharedAt: r.sharedAt.toISOString(),
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        sharedByName,
        isMetadataOnly: r.storagePath.startsWith("chronicle://"),
      };
    });
  } catch (error) {
    logger.error("listActiveSharesForContact failed", { contactId, error });
    return [];
  }
}

/**
 * Load a single share by id, returning only fields the download route needs.
 * Returns null when the share:
 *   - does not exist
 *   - has been revoked
 *   - has expired
 *   - is not shared with the given contact
 *   - references a soft-deleted document
 */
export async function getActiveShareForDownload(
  shareId: string,
  contactId: string,
): Promise<{
  shareId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  canDownload: boolean;
  organizationId: string;
  caseId: string;
} | null> {
  try {
    const now = new Date();
    const [row] = await db
      .select({
        shareId: documentShares.id,
        documentId: documents.id,
        fileName: documents.fileName,
        fileType: documents.fileType,
        storagePath: documents.storagePath,
        canDownload: documentShares.canDownload,
        organizationId: documentShares.organizationId,
        caseId: documentShares.caseId,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documents.id, documentShares.documentId))
      .where(
        and(
          eq(documentShares.id, shareId),
          eq(documentShares.sharedWithContactId, contactId),
          isNull(documentShares.revokedAt),
          isNull(documents.deletedAt),
          or(
            isNull(documentShares.expiresAt),
            gt(documentShares.expiresAt, now),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (error) {
    logger.error("getActiveShareForDownload failed", { shareId, error });
    return null;
  }
}

/**
 * Append a download-view row. Best-effort — never throw; the user's download
 * must not fail because our audit write did.
 */
export async function recordShareView(params: {
  shareId: string;
  viewerIp: string | null;
  userAgent: string | null;
}): Promise<void> {
  try {
    await db.insert(documentShareViews).values({
      shareId: params.shareId,
      viewerIp: params.viewerIp,
      userAgent: params.userAgent,
    });
  } catch (error) {
    logger.error("recordShareView failed", {
      shareId: params.shareId,
      error,
    });
  }
}
