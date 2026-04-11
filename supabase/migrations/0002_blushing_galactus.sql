CREATE TYPE "public"."rfc_status" AS ENUM('not_requested', 'requested', 'received', 'completed');--> statement-breakpoint
CREATE TYPE "public"."mail_type" AS ENUM('certified', 'regular', 'fedex', 'ups');--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_name" text NOT NULL,
	"label" text,
	"username_encrypted" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"totp_secret_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfc_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "rfc_status" DEFAULT 'not_requested' NOT NULL,
	"provider_name" text,
	"requested_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"notes" text,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"recipient_name" text NOT NULL,
	"recipient_address" text,
	"mail_type" "mail_type" DEFAULT 'regular' NOT NULL,
	"tracking_number" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"notes" text,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "hearing_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "mr_status" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "mr_team_color" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "phi_sheet_status" text DEFAULT 'unassigned';--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "phi_sheet_writer_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "phi_sheet_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "phi_sheet_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfc_requests" ADD CONSTRAINT "rfc_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfc_requests" ADD CONSTRAINT "rfc_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfc_requests" ADD CONSTRAINT "rfc_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_mail" ADD CONSTRAINT "outbound_mail_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_mail" ADD CONSTRAINT "outbound_mail_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_mail" ADD CONSTRAINT "outbound_mail_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_provider_creds_org" ON "provider_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_provider_creds_org_active" ON "provider_credentials" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_provider_creds_org_provider" ON "provider_credentials" USING btree ("organization_id","provider_name");--> statement-breakpoint
CREATE INDEX "idx_rfc_requests_org" ON "rfc_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_rfc_requests_case" ON "rfc_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_rfc_requests_org_status" ON "rfc_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_rfc_requests_due" ON "rfc_requests" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_outbound_mail_org" ON "outbound_mail" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_mail_case" ON "outbound_mail" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_mail_tracking" ON "outbound_mail" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_outbound_mail_sent_at" ON "outbound_mail" USING btree ("sent_at");--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_phi_sheet_writer_id_users_id_fk" FOREIGN KEY ("phi_sheet_writer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cases_org_hearing_date" ON "cases" USING btree ("organization_id","hearing_date");--> statement-breakpoint
CREATE INDEX "idx_cases_phi_writer" ON "cases" USING btree ("phi_sheet_writer_id");--> statement-breakpoint
CREATE INDEX "idx_cases_org_phi_status" ON "cases" USING btree ("organization_id","phi_sheet_status");