-- C3: NPS schema + analytics scaffolding.
--
-- Three tables:
--   * nps_campaigns    — per-org configurable survey triggers
--   * nps_responses    — captured claimant scores/comments
--   * nps_action_items — follow-up workflow (mostly detractors)
--
-- All idempotent (CREATE TABLE IF NOT EXISTS). Indexes on org+created_at,
-- case_id, campaign_id, category. Category has a CHECK constraint —
-- computed server-side from score: 9-10 promoter, 7-8 passive, 0-6 detractor.

CREATE TABLE IF NOT EXISTS "nps_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "trigger_stage_id" uuid,
  "delay_days" integer DEFAULT 0 NOT NULL,
  "channel" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_campaigns"
    ADD CONSTRAINT "nps_campaigns_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_campaigns"
    ADD CONSTRAINT "nps_campaigns_trigger_stage_id_case_stages_id_fk"
    FOREIGN KEY ("trigger_stage_id") REFERENCES "case_stages"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_campaigns"
    ADD CONSTRAINT "nps_campaigns_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_campaigns"
    ADD CONSTRAINT "nps_campaigns_channel_check"
    CHECK (channel IN ('email','sms','portal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_nps_campaigns_org_created"
  ON "nps_campaigns" ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_campaigns_trigger_stage"
  ON "nps_campaigns" ("trigger_stage_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "nps_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "campaign_id" uuid,
  "score" integer NOT NULL,
  "category" text NOT NULL,
  "comment" text,
  "sent_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "channel" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_case_id_cases_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_contact_id_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_campaign_id_nps_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "nps_campaigns"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_category_check"
    CHECK (category IN ('promoter','passive','detractor'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_score_check"
    CHECK (score BETWEEN 0 AND 10);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_responses"
    ADD CONSTRAINT "nps_responses_channel_check"
    CHECK (channel IN ('email','sms','portal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_nps_responses_org_created"
  ON "nps_responses" ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_responses_case"
  ON "nps_responses" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_responses_campaign"
  ON "nps_responses" ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_responses_category"
  ON "nps_responses" ("category");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "nps_action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "response_id" uuid NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "assigned_to_user_id" uuid,
  "resolved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_action_items"
    ADD CONSTRAINT "nps_action_items_response_id_nps_responses_id_fk"
    FOREIGN KEY ("response_id") REFERENCES "nps_responses"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_action_items"
    ADD CONSTRAINT "nps_action_items_assigned_to_user_id_users_id_fk"
    FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "nps_action_items"
    ADD CONSTRAINT "nps_action_items_status_check"
    CHECK (status IN ('open','in_progress','resolved'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_nps_action_items_response"
  ON "nps_action_items" ("response_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_action_items_assignee"
  ON "nps_action_items" ("assigned_to_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nps_action_items_status"
  ON "nps_action_items" ("status");
