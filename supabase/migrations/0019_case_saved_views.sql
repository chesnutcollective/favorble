-- Saved views for the cases list: users can persist filter + sort snapshots
-- and optionally share them with their team.
--
-- `filters` holds an arbitrary JSON object matching the shape of the cases-list
-- URL params (search, stage, team, assignedTo, practice, language, unread,
-- urgency, page). `sort` holds { sortBy, sortDir }. Schema is intentionally
-- jsonb so new filters can be added without migrations.

CREATE TABLE IF NOT EXISTS "case_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" text NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sort" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_shared" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_case_saved_views_org"
  ON "case_saved_views" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_case_saved_views_user"
  ON "case_saved_views" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_case_saved_views_org_user"
  ON "case_saved_views" ("organization_id", "user_id");
