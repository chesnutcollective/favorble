-- Expand lead_status enum to mirror MyCase intake pipeline.
-- Postgres requires each ALTER TYPE ADD VALUE to run as its own statement,
-- and new values cannot be added inside a transaction block in older Postgres.
-- Supabase runs each statement-breakpoint line separately, so each ADD VALUE
-- gets its own statement.

-- Initial contact
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'received_inquiry';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'voicemail_left';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'email_sent';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'text_sent';--> statement-breakpoint

-- Qualifying
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'qualifying';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'interested';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'not_interested';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'wrong_number';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'do_not_contact';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'language_barrier';--> statement-breakpoint

-- Intake scheduling
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'intake_no_show';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'intake_rescheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'intake_complete';--> statement-breakpoint

-- Conflict check
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'conflict_pending';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'conflict_cleared';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'conflict_blocked';--> statement-breakpoint

-- Contract
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'contract_drafting';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'contract_followup';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'contract_declined';--> statement-breakpoint

-- Conversion
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'converted_full_rep';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'converted_consult_only';--> statement-breakpoint

-- Decline reasons
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'declined_age';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'declined_capacity';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'declined_outside_state';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'declined_already_repd';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'declined_other';--> statement-breakpoint

-- Other
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'referred_out';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'on_hold';
