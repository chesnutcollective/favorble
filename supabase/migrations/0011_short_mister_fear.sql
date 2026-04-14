CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text,
	"user_email" text NOT NULL,
	"user_name" text,
	"message" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"page_url" text,
	"page_title" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"admin_notes" text,
	"resolved_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feedback_org_created" ON "feedback" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_feedback_org_status" ON "feedback" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_feedback_org_category" ON "feedback" USING btree ("organization_id","category");