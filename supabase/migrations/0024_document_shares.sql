-- Wave 2 E4: Client document sharing.
--
-- Two tables + one column:
--   * document_shares        — which firm-owned document is visible to which
--                              claimant contact (and through which portal user,
--                              if they've accepted their invite).
--   * document_share_views   — append-only tap log of download events from
--                              /api/portal/documents/[shareId]/download so we
--                              can answer "did the claimant actually look at
--                              the MSS letter?" without spelunking through the
--                              activity stream.
--
--   * documents.visible_to_client — denormalized flag flipped by
--                                   shareDocumentWithClient so the cases
--                                   documents view can badge + filter without
--                                   joining back through document_shares.
--
-- Idempotent (IF NOT EXISTS) so re-runs during iteration are safe.

-- ─────────────────────────────────────────────────────────────
-- documents.visible_to_client (add column if missing)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "visible_to_client" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- document_shares
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "shared_with_contact_id" uuid NOT NULL,
  "shared_with_portal_user_id" uuid,
  "can_download" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_document_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_case_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_contact_id_fk"
    FOREIGN KEY ("shared_with_contact_id") REFERENCES "contacts"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_portal_user_id_fk"
    FOREIGN KEY ("shared_with_portal_user_id") REFERENCES "portal_users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_document_shares_document"
  ON "document_shares" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_shares_contact"
  ON "document_shares" ("shared_with_contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_shares_case"
  ON "document_shares" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_shares_org"
  ON "document_shares" ("organization_id");
--> statement-breakpoint

-- Partial index for the most common query — active (non-revoked) shares.
-- The client-side portal list filter + firm-side share count both hit this.
CREATE INDEX IF NOT EXISTS "idx_document_shares_active"
  ON "document_shares" ("shared_with_contact_id", "document_id")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- document_share_views
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_share_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "share_id" uuid NOT NULL,
  "viewed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "viewer_ip" text,
  "user_agent" text
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "document_share_views"
    ADD CONSTRAINT "document_share_views_share_id_fk"
    FOREIGN KEY ("share_id") REFERENCES "document_shares"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_document_share_views_share"
  ON "document_share_views" ("share_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_share_views_viewed"
  ON "document_share_views" ("viewed_at" DESC);
