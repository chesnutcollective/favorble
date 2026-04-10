ALTER TYPE "public"."lead_status" ADD VALUE 'received_inquiry' BEFORE 'contacted';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'voicemail_left' BEFORE 'contacted';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'email_sent' BEFORE 'contacted';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'text_sent' BEFORE 'contacted';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'qualifying' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'interested' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'not_interested' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'wrong_number' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'do_not_contact' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'language_barrier' BEFORE 'intake_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'intake_no_show' BEFORE 'intake_in_progress';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'intake_rescheduled' BEFORE 'intake_in_progress';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'intake_complete' BEFORE 'contract_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'conflict_pending' BEFORE 'contract_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'conflict_cleared' BEFORE 'contract_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'conflict_blocked' BEFORE 'contract_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'contract_drafting' BEFORE 'contract_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'contract_followup' BEFORE 'contract_signed';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'contract_declined' BEFORE 'converted';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'converted_full_rep' BEFORE 'declined';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'converted_consult_only' BEFORE 'declined';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'declined_age' BEFORE 'unresponsive';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'declined_capacity' BEFORE 'unresponsive';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'declined_outside_state' BEFORE 'unresponsive';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'declined_already_repd' BEFORE 'unresponsive';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'declined_other' BEFORE 'unresponsive';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'referred_out';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pipeline_stage" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pipeline_stage_group" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pipeline_stage_order" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE INDEX "idx_leads_pipeline_stage" ON "leads" USING btree ("organization_id","pipeline_stage");