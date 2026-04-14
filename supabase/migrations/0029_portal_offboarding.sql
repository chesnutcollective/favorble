-- Phase 6: Portal offboarding / suspension audit columns.
--
-- Adds:
--   * portal_users.suspended_at       — timestamp when the portal access was
--                                        paused. Null = not suspended.
--   * portal_users.suspended_reason   — free-form staff note captured at the
--                                        moment of revocation.
--   * portal_users.suspended_by       — staff user id that performed the
--                                        pause. Null when suspension comes
--                                        from a system-triggered path.
--
-- The existing `status` column already carries the 'suspended' value (see
-- 0022_client_portal_foundation.sql), so the auth gate does not change —
-- these columns exist purely so we can answer "who paused, when, and why"
-- without spelunking through audit logs.
--
-- Idempotent (IF NOT EXISTS / duplicate_object guards).

ALTER TABLE "portal_users"
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "portal_users"
  ADD COLUMN IF NOT EXISTS "suspended_reason" text;
--> statement-breakpoint

ALTER TABLE "portal_users"
  ADD COLUMN IF NOT EXISTS "suspended_by" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_users"
    ADD CONSTRAINT "portal_users_suspended_by_fk"
    FOREIGN KEY ("suspended_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_portal_users_suspended_at"
  ON "portal_users" ("suspended_at")
  WHERE "suspended_at" IS NOT NULL;
--> statement-breakpoint
