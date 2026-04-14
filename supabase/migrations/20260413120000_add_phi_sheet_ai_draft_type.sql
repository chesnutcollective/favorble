-- Add `phi_sheet` to the ai_draft_type enum so the PHI Sheet Writer
-- persona can persist AI drafts for the Pre-Hearing Intelligence sheet.
-- Postgres requires ALTER TYPE ADD VALUE to run as its own statement.

ALTER TYPE "public"."ai_draft_type" ADD VALUE IF NOT EXISTS 'phi_sheet';
