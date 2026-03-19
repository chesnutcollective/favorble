CREATE TYPE "public"."calendar_event_type" AS ENUM('hearing', 'deadline', 'appointment', 'follow_up', 'reminder');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('active', 'on_hold', 'closed_won', 'closed_lost', 'closed_withdrawn');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('email_inbound', 'email_outbound', 'message_inbound', 'message_outbound', 'phone_inbound', 'phone_outbound', 'note');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select', 'phone', 'email', 'url', 'ssn', 'currency', 'calculated');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('upload', 'template', 'chronicle', 'case_status', 'email', 'esignature');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'intake_scheduled', 'intake_in_progress', 'contract_sent', 'contract_signed', 'converted', 'declined', 'unresponsive', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('pending', 'sent', 'viewed', 'signed', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('intake', 'filing', 'medical_records', 'mail_sorting', 'case_management', 'hearings', 'administration');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'attorney', 'case_manager', 'filing_agent', 'intake_agent', 'mail_clerk', 'medical_records', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger_type" AS ENUM('stage_enter', 'stage_exit', 'case_created', 'field_changed', 'document_received', 'time_elapsed', 'manual');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"team" "team",
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'website',
	"source_data" jsonb DEFAULT '{}'::jsonb,
	"assigned_to_id" uuid,
	"converted_to_case_id" uuid,
	"converted_at" timestamp with time zone,
	"intake_data" jsonb DEFAULT '{}'::jsonb,
	"last_contacted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_stage_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"client_visible_name" text,
	"client_visible_description" text,
	"show_to_client" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transitioned_by" uuid,
	"notes" text,
	"is_automatic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage_group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"owning_team" "team",
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"allowed_next_stage_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_number" text NOT NULL,
	"lead_id" uuid,
	"status" "case_status" DEFAULT 'active' NOT NULL,
	"current_stage_id" uuid NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ssn_encrypted" text,
	"date_of_birth" timestamp with time zone,
	"ssa_claim_number" text,
	"ssa_office" text,
	"application_type_primary" text,
	"application_type_secondary" text,
	"alleged_onset_date" timestamp with time zone,
	"date_last_insured" timestamp with time zone,
	"hearing_office" text,
	"admin_law_judge" text,
	"chronicle_claimant_id" text,
	"chronicle_url" text,
	"chronicle_last_sync_at" timestamp with time zone,
	"case_status_external_id" text,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"relationship" text DEFAULT 'claimant' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"contact_type" text DEFAULT 'claimant' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"field_type" "custom_field_type" NOT NULL,
	"team" "team",
	"section" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"placeholder" text,
	"help_text" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"validation_rules" jsonb DEFAULT '{}'::jsonb,
	"options" jsonb DEFAULT '[]'::jsonb,
	"formula" text,
	"formula_dependencies" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"visible_to_roles" text[],
	"editable_by_roles" text[],
	"show_in_intake_form" boolean DEFAULT false NOT NULL,
	"intake_form_order" integer,
	"intake_form_script" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"text_value" text,
	"number_value" integer,
	"date_value" timestamp with time zone,
	"boolean_value" boolean,
	"json_value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "workflow_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assign_to_team" "team",
	"assign_to_role" text,
	"assign_to_user_id" uuid,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"due_days_offset" integer DEFAULT 1 NOT NULL,
	"due_business_days_only" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"depends_on_template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" "workflow_trigger_type" NOT NULL,
	"trigger_stage_id" uuid,
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"notify_assignees" boolean DEFAULT true NOT NULL,
	"notify_case_manager" boolean DEFAULT true NOT NULL,
	"send_client_message" boolean DEFAULT false NOT NULL,
	"client_message_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assigned_to_id" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"workflow_template_id" uuid,
	"workflow_task_template_id" uuid,
	"is_auto_generated" boolean DEFAULT false NOT NULL,
	"depends_on_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"template_content" text,
	"merge_fields" text[],
	"storage_path" text,
	"requires_signature" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size_bytes" integer,
	"storage_path" text NOT NULL,
	"category" text,
	"source" "document_source" DEFAULT 'upload' NOT NULL,
	"source_external_id" text,
	"description" text,
	"tags" text[],
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" uuid,
	"is_confidential" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"signer_email" text NOT NULL,
	"signer_name" text NOT NULL,
	"status" "signature_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"signed_document_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"type" "communication_type" NOT NULL,
	"direction" text,
	"subject" text,
	"body" text,
	"from_address" text,
	"to_address" text,
	"external_message_id" text,
	"source_system" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text,
	"name" text,
	"response_status" text
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"event_type" "calendar_event_type" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"hearing_office" text,
	"admin_law_judge" text,
	"outlook_event_id" text,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"reminder_config" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_groups" ADD CONSTRAINT "case_stage_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_transitions" ADD CONSTRAINT "case_stage_transitions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_transitions" ADD CONSTRAINT "case_stage_transitions_from_stage_id_case_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."case_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_transitions" ADD CONSTRAINT "case_stage_transitions_to_stage_id_case_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."case_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_transitions" ADD CONSTRAINT "case_stage_transitions_transitioned_by_users_id_fk" FOREIGN KEY ("transitioned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stages" ADD CONSTRAINT "case_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stages" ADD CONSTRAINT "case_stages_stage_group_id_case_stage_groups_id_fk" FOREIGN KEY ("stage_group_id") REFERENCES "public"."case_stage_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_current_stage_id_case_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."case_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_contacts" ADD CONSTRAINT "case_contacts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_contacts" ADD CONSTRAINT "case_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_definition_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_templates" ADD CONSTRAINT "workflow_task_templates_workflow_template_id_workflow_templates_id_fk" FOREIGN KEY ("workflow_template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_trigger_stage_id_case_stages_id_fk" FOREIGN KEY ("trigger_stage_id") REFERENCES "public"."case_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_template_id_workflow_templates_id_fk" FOREIGN KEY ("workflow_template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_task_template_id_workflow_task_templates_id_fk" FOREIGN KEY ("workflow_task_template_id") REFERENCES "public"."workflow_task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_org" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_team" ON "users" USING btree ("organization_id","team");--> statement-breakpoint
CREATE INDEX "idx_users_auth" ON "users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "idx_leads_org_status" ON "leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_leads_assigned" ON "leads" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_leads_org_created" ON "leads" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_assignments_case" ON "case_assignments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_user" ON "case_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_user_active" ON "case_assignments" USING btree ("user_id","unassigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assignments_case_user_role" ON "case_assignments" USING btree ("case_id","user_id","role");--> statement-breakpoint
CREATE INDEX "idx_stage_groups_org" ON "case_stage_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_transitions_case" ON "case_stage_transitions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_transitions_date" ON "case_stage_transitions" USING btree ("transitioned_at");--> statement-breakpoint
CREATE INDEX "idx_stages_org" ON "case_stages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_stages_group" ON "case_stages" USING btree ("stage_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stages_org_code" ON "case_stages" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "idx_cases_org_status" ON "cases" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_cases_org_stage" ON "cases" USING btree ("organization_id","current_stage_id");--> statement-breakpoint
CREATE INDEX "idx_cases_org_number" ON "cases" USING btree ("organization_id","case_number");--> statement-breakpoint
CREATE INDEX "idx_cases_chronicle" ON "cases" USING btree ("chronicle_claimant_id");--> statement-breakpoint
CREATE INDEX "idx_cases_org_created" ON "cases" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cases_org_status_stage" ON "cases" USING btree ("organization_id","status","current_stage_id");--> statement-breakpoint
CREATE INDEX "idx_case_contacts_case" ON "case_contacts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_case_contacts_contact" ON "case_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_case_contacts_unique" ON "case_contacts" USING btree ("case_id","contact_id","relationship");--> statement-breakpoint
CREATE INDEX "idx_contacts_org" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_org_type" ON "contacts" USING btree ("organization_id","contact_type");--> statement-breakpoint
CREATE INDEX "idx_contacts_email" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_cfd_org" ON "custom_field_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_cfd_org_team" ON "custom_field_definitions" USING btree ("organization_id","team");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cfd_org_slug" ON "custom_field_definitions" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "idx_cfv_case" ON "custom_field_values" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cfv_case_field" ON "custom_field_values" USING btree ("case_id","field_definition_id");--> statement-breakpoint
CREATE INDEX "idx_cfv_field_text" ON "custom_field_values" USING btree ("field_definition_id","text_value");--> statement-breakpoint
CREATE INDEX "idx_cfv_field_number" ON "custom_field_values" USING btree ("field_definition_id","number_value");--> statement-breakpoint
CREATE INDEX "idx_cfv_field_date" ON "custom_field_values" USING btree ("field_definition_id","date_value");--> statement-breakpoint
CREATE INDEX "idx_wtt_workflow" ON "workflow_task_templates" USING btree ("workflow_template_id");--> statement-breakpoint
CREATE INDEX "idx_wf_org" ON "workflow_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_wf_trigger_stage" ON "workflow_templates" USING btree ("trigger_stage_id");--> statement-breakpoint
CREATE INDEX "idx_wf_org_active" ON "workflow_templates" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_tasks_org" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_case" ON "tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned" ON "tasks" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned_status" ON "tasks" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned_due" ON "tasks" USING btree ("assigned_to_id","status","due_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_case_status" ON "tasks" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_org_status" ON "tasks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_doc_templates_org" ON "document_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_docs_case" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_docs_source" ON "documents" USING btree ("source","source_external_id");--> statement-breakpoint
CREATE INDEX "idx_docs_case_created" ON "documents" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sig_case" ON "signature_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_sig_status" ON "signature_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_comms_case" ON "communications" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_comms_type" ON "communications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_comms_case_created" ON "communications" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_comms_external" ON "communications" USING btree ("source_system","external_message_id");--> statement-breakpoint
CREATE INDEX "idx_attendees_event" ON "calendar_event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_attendees_user" ON "calendar_event_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_events_org" ON "calendar_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_events_case" ON "calendar_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_events_date" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "idx_events_org_type_date" ON "calendar_events" USING btree ("organization_id","event_type","start_at");--> statement-breakpoint
CREATE INDEX "idx_audit_org" ON "audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_date" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_org_entity_date" ON "audit_log" USING btree ("organization_id","entity_type","created_at");