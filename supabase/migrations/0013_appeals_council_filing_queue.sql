-- Adds filing-queue lifecycle columns to appeals_council_briefs so the
-- "Approve & file" flow can record approval + enqueue-for-filing on the
-- brief row itself. `draft_id` back-references the ai_drafts row that
-- the filing was generated from.
--
-- The existing filed_at column stays — filing_queued_at marks the hand-off
-- to the filing worker, filed_at marks SSA acceptance.
ALTER TABLE "appeals_council_briefs"
  ADD COLUMN IF NOT EXISTS "filing_queued_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appeals_council_briefs"
  ADD COLUMN IF NOT EXISTS "draft_id" uuid;
