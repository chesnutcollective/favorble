"use server";

import { and, desc, eq, isNull, or, gt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  caseContacts,
  contacts,
  documents,
  documentShares,
  portalUsers,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logPhiAccess, logPhiModification } from "@/lib/services/hipaa-audit";
import { logger } from "@/lib/logger/server";

/**
 * E4 — firm-side actions for managing which documents the claimant can see in
 * /portal/documents.
 *
 * All three actions are HIPAA-audited: a "share" is a PHI disclosure event to
 * the claimant's portal, a "revoke" is a modification of that disclosure, and
 * a "list" is a PHI access event (debounced via the audit helper so routine
 * badge renders don't flood the audit table).
 */

export type ShareDocumentWithClientResult =
  | { success: true; shareId: string }
  | { error: string };

/**
 * Create a document_shares row so the claimant can see + download `documentId`
 * from /portal/documents. Also flips documents.visible_to_client = true so the
 * firm-side docs list can render a badge without joining every render.
 *
 * Resolves the claimant contact from case_contacts — firms never share to a
 * non-claimant party from this surface. Pass expiresAt as an ISO string
 * (YYYY-MM-DD from the date picker is fine; we coerce to 23:59:59Z).
 */
export async function shareDocumentWithClient(
  documentId: string,
  expiresAt?: string | null,
): Promise<ShareDocumentWithClientResult> {
  const session = await requireSession();

  try {
    // 1. Load the document, verifying tenant match.
    const [doc] = await db
      .select({
        id: documents.id,
        organizationId: documents.organizationId,
        caseId: documents.caseId,
        fileName: documents.fileName,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.organizationId, session.organizationId),
          isNull(documents.deletedAt),
        ),
      );

    if (!doc) {
      return { error: "Document not found" };
    }

    // 2. Find the claimant contact on the case.
    const [claimant] = await db
      .select({
        id: contacts.id,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          eq(caseContacts.caseId, doc.caseId),
          eq(caseContacts.relationship, "claimant"),
        ),
      )
      .limit(1);

    if (!claimant) {
      return { error: "This case has no claimant on file to share with." };
    }

    // 3. Find the portal_users row for the claimant, if they've been invited.
    const [portalUser] = await db
      .select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.contactId, claimant.id))
      .limit(1);

    // 4. Parse expiry — the picker sends YYYY-MM-DD. Treat as end-of-day UTC
    //    so "expires 4/20" means "good through 4/20".
    let expiresAtDate: Date | null = null;
    if (expiresAt) {
      const parsed = new Date(
        expiresAt.length === 10 ? `${expiresAt}T23:59:59.000Z` : expiresAt,
      );
      if (!Number.isNaN(parsed.getTime())) {
        expiresAtDate = parsed;
      }
    }

    // 5. Create the share row.
    const [shareRow] = await db
      .insert(documentShares)
      .values({
        organizationId: session.organizationId,
        documentId,
        caseId: doc.caseId,
        sharedWithContactId: claimant.id,
        sharedWithPortalUserId: portalUser?.id ?? null,
        canDownload: true,
        expiresAt: expiresAtDate,
        createdBy: session.id,
      })
      .returning({ id: documentShares.id });

    // 6. Flip the denormalized flag. Best-effort — the source of truth is
    //    still document_shares.
    try {
      await db
        .update(documents)
        .set({ visibleToClient: true })
        .where(eq(documents.id, documentId));
    } catch (err) {
      logger.warn("visibleToClient flag update failed", {
        documentId,
        error: err,
      });
    }

    // 7. Audit — this is a PHI disclosure event.
    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "document_share",
      entityId: shareRow.id,
      operation: "create",
      caseId: doc.caseId,
      action: "document_shared_with_client",
      metadata: {
        documentId,
        fileName: doc.fileName,
        contactId: claimant.id,
        expiresAt: expiresAtDate?.toISOString() ?? null,
      },
    });

    logger.info("Document shared with client", {
      shareId: shareRow.id,
      documentId,
      caseId: doc.caseId,
      userId: session.id,
    });

    return { success: true, shareId: shareRow.id };
  } catch (error) {
    logger.error("shareDocumentWithClient failed", { documentId, error });
    return { error: "Failed to share document" };
  }
}

export type RevokeDocumentShareResult =
  | { success: true }
  | { error: string };

/**
 * Stamp revoked_at on a share. If this was the last active share for the
 * document, also flip documents.visible_to_client back to false.
 */
export async function revokeDocumentShare(
  shareId: string,
): Promise<RevokeDocumentShareResult> {
  const session = await requireSession();

  try {
    const [share] = await db
      .select({
        id: documentShares.id,
        organizationId: documentShares.organizationId,
        documentId: documentShares.documentId,
        caseId: documentShares.caseId,
        revokedAt: documentShares.revokedAt,
      })
      .from(documentShares)
      .where(eq(documentShares.id, shareId))
      .limit(1);

    if (!share) {
      return { error: "Share not found" };
    }

    if (share.organizationId !== session.organizationId) {
      return { error: "Share not found" };
    }

    if (share.revokedAt) {
      return { success: true };
    }

    await db
      .update(documentShares)
      .set({ revokedAt: new Date() })
      .where(eq(documentShares.id, shareId));

    // If no active shares remain for this document, clear the denormalized
    // flag. We intentionally check AFTER the revoke write so we don't race
    // with another concurrent share.
    try {
      const [{ activeCount }] = await db
        .select({
          activeCount: sql<number>`count(*)::int`,
        })
        .from(documentShares)
        .where(
          and(
            eq(documentShares.documentId, share.documentId),
            isNull(documentShares.revokedAt),
          ),
        );
      if (activeCount === 0) {
        await db
          .update(documents)
          .set({ visibleToClient: false })
          .where(eq(documents.id, share.documentId));
      }
    } catch (err) {
      logger.warn("visibleToClient flag clear failed", {
        documentId: share.documentId,
        error: err,
      });
    }

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "document_share",
      entityId: shareId,
      operation: "update",
      caseId: share.caseId,
      action: "document_share_revoked",
      metadata: { documentId: share.documentId },
    });

    logger.info("Document share revoked", {
      shareId,
      documentId: share.documentId,
      userId: session.id,
    });

    return { success: true };
  } catch (error) {
    logger.error("revokeDocumentShare failed", { shareId, error });
    return { error: "Failed to revoke share" };
  }
}

export type DocumentShareSummary = {
  id: string;
  documentId: string;
  // Nullable since B3 introduced collab-share-scoped rows that omit
  // sharedWithContactId. Phase 4 portal shares always set it.
  sharedWithContactId: string | null;
  sharedWithName: string | null;
  canDownload: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  viewCount: number;
  lastViewedAt: string | null;
};

/**
 * List all shares (active + revoked + expired) for a given document, including
 * a precomputed `viewCount` so the firm-side doc list can render a
 * "Shared · 2 views" badge without a second round trip.
 *
 * Scoped to the caller's org — returns [] for a cross-tenant documentId.
 */
export async function listDocumentShares(
  documentId: string,
): Promise<DocumentShareSummary[]> {
  const session = await requireSession();

  try {
    // Tenant check first — if the document doesn't belong to the caller's
    // org, don't leak share metadata.
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!doc) return [];

    const rows = await db
      .select({
        id: documentShares.id,
        documentId: documentShares.documentId,
        sharedWithContactId: documentShares.sharedWithContactId,
        canDownload: documentShares.canDownload,
        expiresAt: documentShares.expiresAt,
        revokedAt: documentShares.revokedAt,
        createdAt: documentShares.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        createdByFirstName: users.firstName,
        createdByLastName: users.lastName,
      })
      .from(documentShares)
      .leftJoin(
        contacts,
        eq(contacts.id, documentShares.sharedWithContactId),
      )
      .leftJoin(users, eq(users.id, documentShares.createdBy))
      .where(eq(documentShares.documentId, documentId))
      .orderBy(desc(documentShares.createdAt));

    if (rows.length === 0) return [];

    // Pull view counts + last-viewed timestamps in one grouped query.
    const shareIds = rows.map((r) => r.id);
    const viewRowsRaw = (await db.execute(sql`
      SELECT share_id, count(*)::int as view_count, max(viewed_at) as last_viewed_at
      FROM document_share_views
      WHERE share_id = ANY(${shareIds})
      GROUP BY share_id
    `)) as unknown as Array<{
      share_id: string;
      view_count: number | string;
      last_viewed_at: Date | string | null;
    }>;
    const viewMap = new Map<
      string,
      { viewCount: number; lastViewedAt: Date | null }
    >();
    for (const row of viewRowsRaw) {
      const lastViewed = row.last_viewed_at
        ? row.last_viewed_at instanceof Date
          ? row.last_viewed_at
          : new Date(row.last_viewed_at)
        : null;
      viewMap.set(row.share_id, {
        viewCount: Number(row.view_count ?? 0),
        lastViewedAt: lastViewed,
      });
    }

    // Best-effort PHI access audit (debounced in the helper layer).
    await logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "document",
      entityId: documentId,
      action: "document_shares_list",
      fieldsAccessed: ["document_shares"],
      reason: "firm_side_share_summary",
    });

    return rows.map((r) => {
      const views = viewMap.get(r.id);
      const sharedWithName = r.contactFirstName
        ? `${r.contactFirstName} ${r.contactLastName ?? ""}`.trim()
        : null;
      const createdByName = r.createdByFirstName
        ? `${r.createdByFirstName} ${r.createdByLastName ?? ""}`.trim()
        : null;
      return {
        id: r.id,
        documentId: r.documentId,
        sharedWithContactId: r.sharedWithContactId,
        sharedWithName,
        canDownload: r.canDownload,
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        createdByName,
        viewCount: views?.viewCount ?? 0,
        lastViewedAt: views?.lastViewedAt?.toISOString() ?? null,
      };
    });
  } catch (error) {
    logger.error("listDocumentShares failed", { documentId, error });
    return [];
  }
}

/**
 * Batch variant — returns a {documentId → count} map for the active
 * (non-revoked, non-expired) shares. Used by the firm-side cases documents
 * page to render a "Shared" badge on each row without N+1 calls.
 */
export async function listActiveDocumentShareCounts(
  documentIds: string[],
): Promise<Record<string, number>> {
  if (documentIds.length === 0) return {};
  const session = await requireSession();

  try {
    const now = new Date();
    const rows = await db
      .select({
        documentId: documentShares.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(documentShares)
      .where(
        and(
          eq(documentShares.organizationId, session.organizationId),
          isNull(documentShares.revokedAt),
          or(
            isNull(documentShares.expiresAt),
            gt(documentShares.expiresAt, now),
          ),
        ),
      )
      .groupBy(documentShares.documentId);

    const map: Record<string, number> = {};
    for (const r of rows) {
      if (documentIds.includes(r.documentId)) {
        map[r.documentId] = Number(r.count ?? 0);
      }
    }
    return map;
  } catch (error) {
    logger.error("listActiveDocumentShareCounts failed", { error });
    return {};
  }
}
