CREATE TYPE "public"."ai_draft_status" AS ENUM('generating', 'draft_ready', 'in_review', 'approved', 'sent', 'rejected', 'error');--> statement-breakpoint
CREATE TYPE "public"."ai_draft_type" AS ENUM('client_message', 'client_letter', 'call_script', 'appeal_form', 'reconsideration_request', 'pre_hearing_brief', 'appeals_council_brief', 'medical_records_request', 'fee_petition', 'task_instructions', 'status_update', 'rfc_letter', 'coaching_conversation', 'other');--> statement-breakpoint
CREATE TYPE "public"."call_qc_status" AS ENUM('pending_transcription', 'transcribed', 'pending_review', 'reviewed', 'flagged', 'error');--> statement-breakpoint
CREATE TYPE "public"."coaching_flag_status" AS ENUM('open', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."compliance_finding_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."compliance_finding_status" AS ENUM('open', 'acknowledged', 'remediated', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."escalation_state" AS ENUM('none', 'reminder_sent', 'supervisor_notified', 'management_flagged');--> statement-breakpoint
CREATE TYPE "public"."message_qa_status" AS ENUM('pending', 'passed', 'needs_edit', 'blocked', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'sms', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('info', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."sentiment_label" AS ENUM('positive', 'neutral', 'confused', 'frustrated', 'angry', 'churn_risk');--> statement-breakpoint
CREATE TYPE "public"."supervisor_event_status" AS ENUM('detected', 'file_updated', 'draft_created', 'task_assigned', 'awaiting_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."supervisor_event_type" AS ENUM('denial_received', 'unfavorable_decision', 'favorable_decision', 'hearing_scheduled', 'hearing_rescheduled', 'appeal_deadline_approaching', 'appeal_window_opened', 'new_medical_evidence', 'fee_awarded', 'rfc_received', 'mr_complete', 'missed_task_deadline', 'stagnant_case', 'workload_imbalance', 'ssa_status_change', 'client_message_received', 'client_sentiment_risk', 'compliance_violation');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'pending_client_confirmation';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'fee_collection' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'hearing_advocate' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'appeals_council' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'post_hearing' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'pre_hearing_prep' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'message_received' BEFORE 'time_elapsed';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'event_detected' BEFORE 'manual';--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"chunk_index" integer NOT NULL,
	"page_number" integer,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"token_count" integer,
	"bbox" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_audit_log" (
	"id" bigserial,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"query_scope" text,
	"filters" jsonb,
	"result_count" integer,
	"result_ids" uuid[],
	"latency_ms" integer,
	"client_ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"body" text,
	"tsv" "tsvector",
	"embedding" vector(1536),
	"allowed_roles" text[] DEFAULT '{"attorney","case_manager","admin"}' NOT NULL,
	"allowed_user_ids" uuid[],
	"owner_user_id" uuid,
	"facets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"identifiers" text[],
	"entity_updated_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"muted_event_types" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"action_label" text,
	"action_href" text,
	"dedupe_key" text,
	"source_event_id" uuid,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"event_type" "supervisor_event_type" NOT NULL,
	"status" "supervisor_event_status" DEFAULT 'detected' NOT NULL,
	"summary" text NOT NULL,
	"assigned_user_id" uuid,
	"payload" jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_task_ids" uuid[],
	"linked_draft_ids" uuid[],
	"linked_notification_ids" uuid[],
	"recommended_action" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"type" "ai_draft_type" NOT NULL,
	"status" "ai_draft_status" DEFAULT 'generating' NOT NULL,
	"assigned_reviewer_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"structured_fields" jsonb,
	"source_event_id" uuid,
	"source_communication_id" uuid,
	"source_task_id" uuid,
	"prompt_version" text,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"approved_document_id" uuid,
	"approved_communication_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"edit_distance" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"risk_band" text DEFAULT 'low' NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scorer_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_risk_scores_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
CREATE TABLE "compliance_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_code" text NOT NULL,
	"case_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"severity" "compliance_finding_severity" NOT NULL,
	"status" "compliance_finding_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb,
	"remediation_hint" text,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"remediated_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"default_severity" "compliance_finding_severity" DEFAULT 'medium' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "call_qc_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_recording_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"scores" jsonb NOT NULL,
	"highlights" jsonb,
	"flags" jsonb,
	"summary" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"counterparty_name" text,
	"counterparty_phone" text,
	"direction" text NOT NULL,
	"external_recording_id" text,
	"audio_storage_path" text,
	"duration_seconds" integer,
	"started_at" timestamp with time zone,
	"status" "call_qc_status" DEFAULT 'pending_transcription' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_recording_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"full_text" text NOT NULL,
	"segments" jsonb,
	"confidence" numeric(4, 3),
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_transcripts_call_recording_id_unique" UNIQUE("call_recording_id")
);
--> statement-breakpoint
CREATE TABLE "coaching_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"coaching_flag_id" uuid,
	"subject_user_id" uuid NOT NULL,
	"supervisor_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"examples" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"supervisor_user_id" uuid,
	"role" text NOT NULL,
	"metric_key" text NOT NULL,
	"severity" integer NOT NULL,
	"status" "coaching_flag_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"suggested_action_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification" text,
	"notes" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"metric_key" text NOT NULL,
	"affected_user_count" integer NOT NULL,
	"total_user_count" integer NOT NULL,
	"summary" text NOT NULL,
	"recommendation" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_comms_external";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_communication_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "escalation_state" "escalation_state" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "last_escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_confirmation_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_confirmation_answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_confirmation_answer" text;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "thread_id" uuid;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "response_time_seconds" integer;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "responded_by" uuid;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "sentiment_score" numeric(5, 3);--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "sentiment_label" "sentiment_label";--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "sentiment_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "qa_status" "message_qa_status";--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "qa_score" integer;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "qa_notes" text;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "qa_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_events" ADD CONSTRAINT "supervisor_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_events" ADD CONSTRAINT "supervisor_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_events" ADD CONSTRAINT "supervisor_events_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_performance_snapshots" ADD CONSTRAINT "team_performance_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_risk_scores" ADD CONSTRAINT "case_risk_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_risk_scores" ADD CONSTRAINT "case_risk_scores_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_qc_reviews" ADD CONSTRAINT "call_qc_reviews_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_drafts" ADD CONSTRAINT "coaching_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_drafts" ADD CONSTRAINT "coaching_drafts_coaching_flag_id_coaching_flags_id_fk" FOREIGN KEY ("coaching_flag_id") REFERENCES "public"."coaching_flags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_drafts" ADD CONSTRAINT "coaching_drafts_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_drafts" ADD CONSTRAINT "coaching_drafts_supervisor_user_id_users_id_fk" FOREIGN KEY ("supervisor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_flags" ADD CONSTRAINT "coaching_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_flags" ADD CONSTRAINT "coaching_flags_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_flags" ADD CONSTRAINT "coaching_flags_supervisor_user_id_users_id_fk" FOREIGN KEY ("supervisor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_gaps" ADD CONSTRAINT "training_gaps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_unique" ON "document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_doc_chunks_case" ON "document_chunks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_doc_chunks_org" ON "document_chunks" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_documents_entity_unique" ON "search_documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_search_docs_org_type" ON "search_documents" USING btree ("organization_id","entity_type","entity_updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_notification" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_unread" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_org" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_case" ON "notifications" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_dedupe" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_supervisor_events_org_status" ON "supervisor_events" USING btree ("organization_id","status","detected_at");--> statement-breakpoint
CREATE INDEX "idx_supervisor_events_case" ON "supervisor_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_supervisor_events_type" ON "supervisor_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_supervisor_events_assigned" ON "supervisor_events" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_drafts_org_status" ON "ai_drafts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_drafts_case" ON "ai_drafts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_ai_drafts_reviewer" ON "ai_drafts" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_ai_drafts_type" ON "ai_drafts" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_perf_snapshots_user_metric_day" ON "performance_snapshots" USING btree ("user_id","metric_key","period_start");--> statement-breakpoint
CREATE INDEX "idx_perf_snapshots_org_day" ON "performance_snapshots" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "idx_perf_snapshots_role_metric" ON "performance_snapshots" USING btree ("role","metric_key","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_perf_snapshots_team_metric_day" ON "team_performance_snapshots" USING btree ("team","metric_key","period_start");--> statement-breakpoint
CREATE INDEX "idx_team_perf_snapshots_org_day" ON "team_performance_snapshots" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "idx_case_risk_org_band" ON "case_risk_scores" USING btree ("organization_id","risk_band");--> statement-breakpoint
CREATE INDEX "idx_case_risk_score" ON "case_risk_scores" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_compliance_findings_org_status" ON "compliance_findings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_compliance_findings_case" ON "compliance_findings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_findings_severity" ON "compliance_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_compliance_findings_rule" ON "compliance_findings" USING btree ("rule_code");--> statement-breakpoint
CREATE INDEX "idx_call_qc_reviews_recording" ON "call_qc_reviews" USING btree ("call_recording_id");--> statement-breakpoint
CREATE INDEX "idx_call_qc_reviews_score" ON "call_qc_reviews" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "idx_call_recordings_org_status" ON "call_recordings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_call_recordings_case" ON "call_recordings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_call_recordings_user" ON "call_recordings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_drafts_subject" ON "coaching_drafts" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_drafts_supervisor" ON "coaching_drafts" USING btree ("supervisor_user_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_flags_subject" ON "coaching_flags" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "idx_coaching_flags_org_status" ON "coaching_flags" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_training_gaps_role" ON "training_gaps" USING btree ("role");--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_comms_external" ON "communications" USING btree ("source_system","external_message_id") WHERE "communications"."external_message_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_comms_thread" ON "communications" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_comms_sentiment" ON "communications" USING btree ("sentiment_label");--> statement-breakpoint
CREATE INDEX "idx_comms_read" ON "communications" USING btree ("read_at");