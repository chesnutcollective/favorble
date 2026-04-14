CREATE TABLE "appeals_council_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"unfavorable_decision_date" timestamp with time zone,
	"deadline_date" timestamp with time zone,
	"draft_started_at" timestamp with time zone,
	"draft_completed_at" timestamp with time zone,
	"review_completed_at" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"outcome_at" timestamp with time zone,
	"outcome" text,
	"draft_document_id" uuid,
	"issues_identified" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_collection_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fee_petition_id" uuid NOT NULL,
	"followed_up_by" uuid,
	"method" text NOT NULL,
	"outcome" text,
	"notes" text,
	"followed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_petitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"favorable_decision_date" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"denied_at" timestamp with time zone,
	"requested_amount_cents" integer,
	"approved_amount_cents" integer,
	"collected_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearing_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"hearing_date" timestamp with time zone NOT NULL,
	"outcome" text,
	"outcome_received_at" timestamp with time zone,
	"client_notified_at" timestamp with time zone,
	"case_stage_advanced_at" timestamp with time zone,
	"post_hearing_tasks_created_at" timestamp with time zone,
	"processing_completed_at" timestamp with time zone,
	"processed_by" uuid,
	"decision_text" text,
	"decision_document_id" uuid,
	"raw_data" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeals_council_briefs" ADD CONSTRAINT "appeals_council_briefs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals_council_briefs" ADD CONSTRAINT "appeals_council_briefs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals_council_briefs" ADD CONSTRAINT "appeals_council_briefs_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_collection_follow_ups" ADD CONSTRAINT "fee_collection_follow_ups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_collection_follow_ups" ADD CONSTRAINT "fee_collection_follow_ups_fee_petition_id_fee_petitions_id_fk" FOREIGN KEY ("fee_petition_id") REFERENCES "public"."fee_petitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_collection_follow_ups" ADD CONSTRAINT "fee_collection_follow_ups_followed_up_by_users_id_fk" FOREIGN KEY ("followed_up_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_petitions" ADD CONSTRAINT "fee_petitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_petitions" ADD CONSTRAINT "fee_petitions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_petitions" ADD CONSTRAINT "fee_petitions_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_outcomes" ADD CONSTRAINT "hearing_outcomes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_outcomes" ADD CONSTRAINT "hearing_outcomes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_outcomes" ADD CONSTRAINT "hearing_outcomes_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ac_briefs_org_status" ON "appeals_council_briefs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_ac_briefs_case" ON "appeals_council_briefs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_ac_briefs_assigned" ON "appeals_council_briefs" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_ac_briefs_deadline" ON "appeals_council_briefs" USING btree ("deadline_date");--> statement-breakpoint
CREATE INDEX "idx_fee_followups_petition" ON "fee_collection_follow_ups" USING btree ("fee_petition_id");--> statement-breakpoint
CREATE INDEX "idx_fee_followups_user" ON "fee_collection_follow_ups" USING btree ("followed_up_by");--> statement-breakpoint
CREATE INDEX "idx_fee_petitions_org_status" ON "fee_petitions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_fee_petitions_case" ON "fee_petitions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_fee_petitions_assigned" ON "fee_petitions" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_fee_petitions_filed_at" ON "fee_petitions" USING btree ("filed_at");--> statement-breakpoint
CREATE INDEX "idx_hearing_outcomes_org" ON "hearing_outcomes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_hearing_outcomes_case" ON "hearing_outcomes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_hearing_outcomes_processor" ON "hearing_outcomes" USING btree ("processed_by");--> statement-breakpoint
CREATE INDEX "idx_hearing_outcomes_received" ON "hearing_outcomes" USING btree ("outcome_received_at");