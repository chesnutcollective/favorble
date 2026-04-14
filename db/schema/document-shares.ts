import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { contacts } from "./contacts";
import { documents } from "./documents";
import { users } from "./users";
import { portalUsers } from "./portal";
import { collabShares } from "./collab-shares";

/**
 * E4 (Wave 2): Client document sharing.
 *
 * Two tables:
 *   * document_shares       — which firm-owned document is visible to which
 *                             claimant contact (one row per share; staff can
 *                             revoke by stamping `revoked_at`).
 *   * document_share_views  — append-only tap log of portal-side downloads.
 *                             One row per GET on /api/portal/documents/
 *                             [shareId]/download so staff can see whether the
 *                             claimant actually opened each shared file.
 *
 * See supabase/migrations/0024_document_shares.sql for the table DDL plus the
 * `documents.visible_to_client` denormalized flag.
 */
export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    /**
     * Phase 4: client-portal sharing (claimant contact). Required when the
     * row scopes a doc to a portal user. Nullable so B3 collaborator-scoped
     * rows can omit it.
     */
    sharedWithContactId: uuid("shared_with_contact_id").references(
      () => contacts.id,
    ),
    /**
     * B3: external collaborator sharing — when set, the row scopes a doc to
     * a magic-link share rather than a portal contact. Exactly one of
     * `sharedWithContactId` / `collabShareId` should be set per row.
     */
    collabShareId: uuid("collab_share_id").references(() => collabShares.id, {
      onDelete: "cascade",
    }),
    /**
     * Nullable: a share can exist before the claimant accepts their invite.
     * The portal list query primarily filters by sharedWithContactId so this
     * is just a convenience link back to the portal_users row when present.
     */
    sharedWithPortalUserId: uuid("shared_with_portal_user_id").references(
      () => portalUsers.id,
    ),
    canDownload: boolean("can_download").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_document_shares_document").on(table.documentId),
    index("idx_document_shares_contact").on(table.sharedWithContactId),
    index("idx_document_shares_case").on(table.caseId),
    index("idx_document_shares_org").on(table.organizationId),
    index("idx_doc_shares_collab").on(table.collabShareId),
    // The partial index (WHERE revoked_at IS NULL) is declared in the raw SQL
    // migration — Drizzle can't express partial indexes in the schema DSL
    // without losing clarity, so we let the migration be the source of truth
    // and expose it here as a no-op hint.
  ],
);

export const documentShareViews = pgTable(
  "document_share_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => documentShares.id),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    viewerIp: text("viewer_ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_document_share_views_share").on(table.shareId),
    index("idx_document_share_views_viewed").on(table.viewedAt),
  ],
);

export type DocumentShareRow = typeof documentShares.$inferSelect;
export type NewDocumentShareRow = typeof documentShares.$inferInsert;
export type DocumentShareViewRow = typeof documentShareViews.$inferSelect;
export type NewDocumentShareViewRow = typeof documentShareViews.$inferInsert;
