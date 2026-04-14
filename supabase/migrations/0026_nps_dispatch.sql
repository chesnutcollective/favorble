-- Phase 5 A2: NPS dispatch + survey-taking flow.
--
-- Schema adjustments to let us enqueue nps_responses rows BEFORE the claimant
-- actually scores the survey:
--   * `score` and `category` become nullable — we persist the row at stage
--     transition with nulls, then fill them in when the claimant submits.
--   * A `metadata jsonb` column stores the `scheduledFor` timestamp and any
--     delivery flags (e.g. `{"skipped": "no_twilio"}`).
--   * The score CHECK now allows NULL; the category CHECK is relaxed the
--     same way.
--
-- Idempotent — safe to re-run.

ALTER TABLE "nps_responses"
  ALTER COLUMN "score" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "nps_responses"
  ALTER COLUMN "category" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "nps_responses"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

-- Swap out the old strict CHECK constraints for ones that permit NULL while
-- still enforcing the valid set when a value is present.
DO $$ BEGIN
  ALTER TABLE "nps_responses"
    DROP CONSTRAINT IF EXISTS "nps_responses_category_check";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_category_check"
    CHECK (category IS NULL OR category IN ('promoter','passive','detractor'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    DROP CONSTRAINT IF EXISTS "nps_responses_score_check";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_score_check"
    CHECK (score IS NULL OR (score BETWEEN 0 AND 10));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Index for the dispatcher: "find pending rows to send".
CREATE INDEX IF NOT EXISTS "idx_nps_responses_pending_dispatch"
  ON "nps_responses" ("sent_at", "responded_at")
  WHERE "sent_at" IS NULL;
