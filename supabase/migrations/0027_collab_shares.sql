-- B3: External collaborator shares + scoped messaging.
--
-- Adds three new tables (collab_shares, collab_share_recipients,
-- collab_share_messages) and extends the existing document_shares table
-- (created in migration 0024 for Phase 4 client portal) with a
-- collab_share_id column so the same join-table can scope docs to either
-- a portal contact OR an external collaborator.
--
-- Security:
--   - Tokens are handed out as 32-byte hex values via magic link; only the
--     SHA-256 hash is persisted in `token_hash`.
--   - `expires_at` is required; `revoked_at` captures explicit revocation.
--     The public route MUST enforce both.

-- ─────────────────────────────────────────────────────────────
-- collab_shares
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "collab_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "collab_shares" ADD CONSTRAINT "collab_shares_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "collab_shares" ADD CONSTRAINT "collab_shares_case_id_cases_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "collab_shares" ADD CONSTRAINT "collab_shares_revoked_by_users_id_fk"
    FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "collab_shares" ADD CONSTRAINT "collab_shares_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_collab_shares_case" ON "collab_shares" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_collab_shares_token_hash" ON "collab_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collab_shares_active" ON "collab_shares" USING btree ("case_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- collab_share_recipients
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "collab_share_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "collab_share_recipients" ADD CONSTRAINT "collab_share_recipients_share_id_collab_shares_id_fk"
    FOREIGN KEY ("share_id") REFERENCES "public"."collab_shares"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collab_recipients_share" ON "collab_share_recipients" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collab_recipients_email" ON "collab_share_recipients" USING btree ("email");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- collab_share_messages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "collab_share_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_by_firm_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "collab_share_messages" ADD CONSTRAINT "collab_share_messages_share_id_collab_shares_id_fk"
    FOREIGN KEY ("share_id") REFERENCES "public"."collab_shares"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collab_messages_share" ON "collab_share_messages" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collab_messages_share_created" ON "collab_share_messages" USING btree ("share_id","created_at");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- document_shares — extend Phase 4 table with collab_share_id column.
-- Phase 4 (migration 0024) made shared_with_contact_id NOT NULL; we relax
-- that here so a row can be scoped to a collab share instead. Application
-- layer enforces "exactly one of contact / collab_share is set".
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "document_shares"
  ADD COLUMN IF NOT EXISTS "collab_share_id" uuid;
--> statement-breakpoint
ALTER TABLE "document_shares"
  ALTER COLUMN "shared_with_contact_id" DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_collab_share_id_collab_shares_id_fk"
    FOREIGN KEY ("collab_share_id") REFERENCES "public"."collab_shares"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_doc_shares_collab" ON "document_shares" USING btree ("collab_share_id");
