CREATE TYPE "public"."document_processing_status" AS ENUM('pending', 'extracting', 'classifying', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ere_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ere_job_type" AS ENUM('full_scrape', 'incremental_sync', 'document_download', 'status_check');--> statement-breakpoint
CREATE TYPE "public"."exhibit_packet_status" AS ENUM('draft', 'building', 'ready', 'submitted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."medical_entry_type" AS ENUM('office_visit', 'hospitalization', 'emergency', 'lab_result', 'imaging', 'mental_health', 'physical_therapy', 'surgery', 'prescription', 'diagnosis', 'functional_assessment', 'other');--> statement-breakpoint
ALTER TYPE "public"."document_source" ADD VALUE 'ere';--> statement-breakpoint
CREATE TABLE "lead_signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"signer_email" text NOT NULL,
	"signer_name" text NOT NULL,
	"contract_type" text DEFAULT 'retainer',
	"status" "signature_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ere_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text,
	"username_encrypted" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"totp_secret_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ere_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"job_type" "ere_job_type" DEFAULT 'full_scrape' NOT NULL,
	"status" "ere_job_status" DEFAULT 'pending' NOT NULL,
	"ssa_claim_number" text,
	"documents_found" integer,
	"documents_downloaded" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "scraped_case_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"ere_job_id" uuid NOT NULL,
	"claim_status" text,
	"hearing_date" timestamp with time zone,
	"hearing_office" text,
	"admin_law_judge" text,
	"documents_on_file" integer,
	"raw_data" jsonb,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processing_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "document_processing_status" DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"page_count" integer,
	"document_category" text,
	"provider_name" text,
	"provider_type" text,
	"treatment_date_start" timestamp with time zone,
	"treatment_date_end" timestamp with time zone,
	"ai_classification" jsonb DEFAULT '{}'::jsonb,
	"ai_confidence" integer,
	"error_message" text,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exhibit_packet_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"exhibit_label" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exhibit_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "exhibit_packet_status" DEFAULT 'draft' NOT NULL,
	"packet_storage_path" text,
	"packet_size_bytes" integer,
	"table_of_contents" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"built_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "medical_chronology_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"source_document_id" uuid,
	"entry_type" "medical_entry_type" DEFAULT 'other' NOT NULL,
	"event_date" timestamp with time zone,
	"event_date_end" timestamp with time zone,
	"provider_name" text,
	"provider_type" text,
	"facility_name" text,
	"summary" text NOT NULL,
	"details" text,
	"diagnoses" text[],
	"treatments" text[],
	"medications" text[],
	"page_reference" text,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_stages" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "ere_last_scrape_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "ere_last_scrape_status" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "chronology_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "chronology_entry_count" integer;--> statement-breakpoint
ALTER TABLE "lead_signature_requests" ADD CONSTRAINT "lead_signature_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_signature_requests" ADD CONSTRAINT "lead_signature_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_credentials" ADD CONSTRAINT "ere_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_credentials" ADD CONSTRAINT "ere_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_jobs" ADD CONSTRAINT "ere_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_jobs" ADD CONSTRAINT "ere_jobs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_jobs" ADD CONSTRAINT "ere_jobs_credential_id_ere_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."ere_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ere_jobs" ADD CONSTRAINT "ere_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_case_data" ADD CONSTRAINT "scraped_case_data_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_case_data" ADD CONSTRAINT "scraped_case_data_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_case_data" ADD CONSTRAINT "scraped_case_data_ere_job_id_ere_jobs_id_fk" FOREIGN KEY ("ere_job_id") REFERENCES "public"."ere_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibit_packet_documents" ADD CONSTRAINT "exhibit_packet_documents_packet_id_exhibit_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."exhibit_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibit_packet_documents" ADD CONSTRAINT "exhibit_packet_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibit_packets" ADD CONSTRAINT "exhibit_packets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibit_packets" ADD CONSTRAINT "exhibit_packets_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibit_packets" ADD CONSTRAINT "exhibit_packets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_chronology_entries" ADD CONSTRAINT "medical_chronology_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_chronology_entries" ADD CONSTRAINT "medical_chronology_entries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_chronology_entries" ADD CONSTRAINT "medical_chronology_entries_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_chronology_entries" ADD CONSTRAINT "medical_chronology_entries_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_sig_lead" ON "lead_signature_requests" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_sig_status" ON "lead_signature_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ere_creds_org" ON "ere_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_ere_creds_org_active" ON "ere_credentials" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_ere_jobs_case" ON "ere_jobs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_ere_jobs_org_status" ON "ere_jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_ere_jobs_created" ON "ere_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ere_jobs_case_status" ON "ere_jobs" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "idx_scraped_case_created" ON "scraped_case_data" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_doc_proc_document" ON "document_processing_results" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_proc_case" ON "document_processing_results" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_doc_proc_status" ON "document_processing_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_doc_proc_case_category" ON "document_processing_results" USING btree ("case_id","document_category");--> statement-breakpoint
CREATE INDEX "idx_doc_proc_provider" ON "document_processing_results" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX "idx_exhibit_packet_docs_packet" ON "exhibit_packet_documents" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "idx_exhibit_packet_docs_document" ON "exhibit_packet_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_exhibit_packets_case" ON "exhibit_packets" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_exhibit_packets_org_status" ON "exhibit_packets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_med_chron_case" ON "medical_chronology_entries" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_med_chron_case_date" ON "medical_chronology_entries" USING btree ("case_id","event_date");--> statement-breakpoint
CREATE INDEX "idx_med_chron_source_doc" ON "medical_chronology_entries" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "idx_med_chron_case_type" ON "medical_chronology_entries" USING btree ("case_id","entry_type");--> statement-breakpoint
CREATE INDEX "idx_med_chron_provider" ON "medical_chronology_entries" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX "idx_med_chron_case_verified" ON "medical_chronology_entries" USING btree ("case_id","is_verified");