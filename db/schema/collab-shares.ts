import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { documents } from "./documents";

/**
 * External collaborator shares — scoped, magic-link-backed access for third
 * parties (treating physicians, family members, prior counsel, etc.) who need
 * to view a subset of case material and exchange messages without having a
 * full Hogan Smith account.
 *
 * Security model:
 *   - Token is a 32-byte hex value handed out via magic link; only the SHA-256
 *     hash lives in the database (`tokenHash`).
 *   - `expiresAt` is required; `revokedAt` + `revokedBy` capture explicit
 *     revocation. Public route must enforce BOTH.
 */
export const collabShares = pgTable(
  "collab_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    subject: text("subject").notNull(),
    message: text("message"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_collab_shares_case").on(table.caseId),
    uniqueIndex("idx_collab_shares_token_hash").on(table.tokenHash),
    index("idx_collab_shares_active")
      .on(table.caseId)
      .where(sql`revoked_at IS NULL`),
  ],
);

/**
 * Recipients attached to a share — one row per external email invited. Used
 * both for audit (who we told) and for per-recipient view/response stamps.
 */
export const collabShareRecipients = pgTable(
  "collab_share_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => collabShares.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    /** medical_provider | family | legal_counsel | other */
    role: text("role"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_collab_recipients_share").on(table.shareId),
    index("idx_collab_recipients_email").on(table.email),
  ],
);

/**
 * Bi-directional messages between the firm and an external collaborator,
 * scoped to a single share. Inbound messages (from the public route) have
 * `read_by_firm_at` null until a firm user marks them read.
 */
export const collabShareMessages = pgTable(
  "collab_share_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => collabShares.id, { onDelete: "cascade" }),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readByFirmAt: timestamp("read_by_firm_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_collab_messages_share").on(table.shareId),
    index("idx_collab_messages_share_created").on(
      table.shareId,
      table.createdAt,
    ),
  ],
);

/**
 * Document shares — join table for expressing "which docs are visible on
 * which share mechanism". Phase 4 will grow this table; for now, collab
 * shares use `collabShareId` to scope access to one external party.
 *
 * Exactly one of the share-target columns should be set on any row. The
 * `sharedWithContactId` column is reserved for the Phase 4 client-portal
 * use case and left untyped (no FK) so Phase 4 can wire it to the right
 * table without touching this migration.
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
      .references(() => documents.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    /** Collab share this document row is scoped to (external collaborator). */
    collabShareId: uuid("collab_share_id").references(() => collabShares.id, {
      onDelete: "cascade",
    }),
    /** Reserved for Phase 4 client-portal use. */
    sharedWithContactId: uuid("shared_with_contact_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_doc_shares_doc").on(table.documentId),
    index("idx_doc_shares_case").on(table.caseId),
    index("idx_doc_shares_collab").on(table.collabShareId),
    index("idx_doc_shares_contact").on(table.sharedWithContactId),
  ],
);
