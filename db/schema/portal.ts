import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { contacts } from "./contacts";
import { users } from "./users";

/**
 * Client portal foundation (Wave 1).
 *
 * Three tables:
 *   * portal_users            — bridge between a Clerk auth user (role=client)
 *                               and a Favorble contact. One row per claimant.
 *   * client_invitations      — time-limited accept-tokens generated when staff
 *                               sends an invite. Token stored as hash (never raw).
 *   * portal_activity_events  — append-only log of everything a portal user
 *                               does (logins, views, messages sent, NPS submits).
 *
 * Migration is idempotent (CREATE TABLE IF NOT EXISTS) so re-running during
 * iteration is safe. See supabase/migrations/0022_client_portal_foundation.sql.
 */
export const portalUsers = pgTable(
  "portal_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    /** Clerk user id (user_XXX). Text, not uuid, because Clerk IDs are opaque. */
    authUserId: text("auth_user_id").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    /** 'invited' | 'active' | 'suspended' | 'deactivated' (CHECK constraint in migration) */
    status: text("status").notNull().default("invited"),
    preferredLocale: text("preferred_locale").notNull().default("en"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    loginCount: integer("login_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_portal_users_contact").on(table.contactId),
    uniqueIndex("idx_portal_users_auth").on(table.authUserId),
    index("idx_portal_users_org").on(table.organizationId),
    index("idx_portal_users_email").on(table.email),
  ],
);

export const clientInvitations = pgTable(
  "client_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    /** 'email' | 'sms' (CHECK in migration) */
    channel: text("channel").notNull().default("email"),
    /** SHA-256 hash of the random token. Raw token is only ever shown in the URL. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    sentBy: uuid("sent_by").references(() => users.id),
    /** Clerk invitation id (inv_XXX) if we successfully called their API. */
    clerkInvitationId: text("clerk_invitation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_client_invitations_token").on(table.tokenHash),
    index("idx_client_invitations_org").on(table.organizationId),
    index("idx_client_invitations_case").on(table.caseId),
    index("idx_client_invitations_contact").on(table.contactId),
  ],
);

export const portalActivityEvents = pgTable(
  "portal_activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id),
    caseId: uuid("case_id").references(() => cases.id),
    /**
     * Free-form event type string so Wave 2 agents can add new events without
     * touching a shared enum. Conventions:
     *   'login' | 'view_stage' | 'view_document' | 'send_message' |
     *   'submit_nps' | 'upload_document' | 'view_appointments' | ...
     */
    eventType: text("event_type").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_portal_events_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_portal_events_user_created").on(
      table.portalUserId,
      table.createdAt,
    ),
    index("idx_portal_events_case_created").on(table.caseId, table.createdAt),
  ],
);

/**
 * Short-lived magic-link tokens used by the SMS notification channel (Wave 2).
 * Each outbound portal SMS that deep-links into a page (new message, stage
 * change, appointment reminder) mints a token here. When the claimant taps
 * the link we validate the hash, establish a Clerk session, mark the token
 * consumed, and redirect to `path`.
 *
 * Tokens are 32-byte hex and stored as SHA-256 hashes — the raw value only
 * ever lives in the URL. TTL defaults to 15 minutes.
 */
export const portalMagicLinks = pgTable(
  "portal_magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    /** Path (e.g. '/portal/messages?thread=…') the link redirects to. */
    path: text("path").notNull(),
    /** SHA-256 of the raw token; raw value only lives in the URL. */
    tokenHash: text("token_hash").notNull(),
    /** Free-form campaign/event string for analytics. */
    campaign: text("campaign"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_portal_magic_links_token").on(table.tokenHash),
    index("idx_portal_magic_links_expires").on(table.expiresAt),
    index("idx_portal_magic_links_contact").on(table.contactId),
  ],
);

export type PortalUserRow = typeof portalUsers.$inferSelect;
export type NewPortalUserRow = typeof portalUsers.$inferInsert;
export type ClientInvitationRow = typeof clientInvitations.$inferSelect;
export type NewClientInvitationRow = typeof clientInvitations.$inferInsert;
export type PortalActivityEventRow = typeof portalActivityEvents.$inferSelect;
export type NewPortalActivityEventRow =
  typeof portalActivityEvents.$inferInsert;
export type PortalMagicLinkRow = typeof portalMagicLinks.$inferSelect;
export type NewPortalMagicLinkRow = typeof portalMagicLinks.$inferInsert;
