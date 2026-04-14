-- Post-hearing outcomes tracking table.
-- Supports the post_hearing persona workflows: approve, override AI, and
-- mark complete. Outcome + status are stored as text (not enums) so new
-- values can be added without a schema migration.
--
-- Safe to re-run — all statements use IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "hearing_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "case_id" uuid NOT NULL REFERENCES "cases"("id"),
  "outcome" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_review',
  "ai_confidence" integer,
  "ai_outcome" text,
  "original_outcome" text,
  "override_reason" text,
  "overridden_at" timestamp with time zone,
  "overridden_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "approved_by" uuid REFERENCES "users"("id"),
  "completed_at" timestamp with time zone,
  "completed_by" uuid REFERENCES "users"("id"),
  "notes" text,
  "hearing_date" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_hearing_outcomes_org"
  ON "hearing_outcomes" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_outcomes_case"
  ON "hearing_outcomes" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_outcomes_org_status"
  ON "hearing_outcomes" ("organization_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_outcomes_org_confidence"
  ON "hearing_outcomes" ("organization_id", "ai_confidence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_outcomes_created"
  ON "hearing_outcomes" ("created_at");
