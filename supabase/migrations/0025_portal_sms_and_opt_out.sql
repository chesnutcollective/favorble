-- Wave 2: Portal SMS notification channel + magic-link auth.
--
-- Adds:
--   * contacts.sms_opt_out_at / sms_opt_in_at — consent timestamps. NULL means
--     "never set" (treat as neutral; app-level default). When sms_opt_out_at
--     is non-null we MUST NOT send portal SMS to that contact.
--   * communications.source_type — high-level source tag so portal-sent SMS
--     can be filtered from staff-side Twilio traffic without metadata diving.
--   * communication_type enum gains 'sms_outbound' and 'sms_inbound'.
--   * portal_magic_links — short-lived (15 min) single-use auth tokens
--     minted by portal SMS. Raw token only in the URL; DB stores SHA-256.
--
-- Idempotent (IF NOT EXISTS, DO $$ … duplicate_object guards) so re-runs
-- during local dev iteration are safe.

-- ─────────────────────────────────────────────────────────────
-- contacts: SMS consent timestamps
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "sms_opt_out_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "sms_opt_in_at" timestamp with time zone;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- communications: source_type + sms enum values
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "source_type" text;
--> statement-breakpoint

-- Postgres enum additions are safe via ADD VALUE IF NOT EXISTS (PG12+).
ALTER TYPE "communication_type" ADD VALUE IF NOT EXISTS 'sms_outbound';
--> statement-breakpoint

ALTER TYPE "communication_type" ADD VALUE IF NOT EXISTS 'sms_inbound';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- portal_magic_links
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "portal_magic_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "path" text NOT NULL,
  "token_hash" text NOT NULL,
  "campaign" text,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_magic_links"
    ADD CONSTRAINT "portal_magic_links_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_magic_links"
    ADD CONSTRAINT "portal_magic_links_contact_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_magic_links_token"
  ON "portal_magic_links" ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_portal_magic_links_expires"
  ON "portal_magic_links" ("expires_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_portal_magic_links_contact"
  ON "portal_magic_links" ("contact_id");
--> statement-breakpoint
