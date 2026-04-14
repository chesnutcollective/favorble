-- Phase 5 / B6: Client treatment log + staff merge-into-chronology flow.
--
-- client_treatment_entries is the claimant-facing bridge into the medical
-- chronology. The client records a visit ("Saw Dr. Smith on 2026-02-14 for
-- back pain, here's the receipt"); medical-records staff later review the
-- entry and either promote it into medical_chronology_entries (filling in
-- ICD codes + normalizing provider names) or reject it with a reason.
--
-- Status lifecycle:
--   pending  -> merged   (via mergeTreatmentEntryIntoChronology)
--   pending  -> rejected (via rejectTreatmentEntry, notes carries reason)
--
-- When merged, promoted_to_chronology_entry_id back-references the newly
-- created medical_chronology_entries row so the client portal can surface
-- "reviewed" status and staff can jump from the log into the chronology.
--
-- Idempotent (IF NOT EXISTS, DO $$ … duplicate_object guards) so re-runs
-- during local dev iteration are safe.

CREATE TABLE IF NOT EXISTS "client_treatment_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "portal_user_id" uuid NOT NULL,
  "provider_name" text NOT NULL,
  "visit_date" timestamp with time zone NOT NULL,
  "reason" text,
  "notes" text,
  "receipt_document_id" uuid,
  "promoted_to_chronology_entry_id" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_case_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_portal_user_id_fk"
    FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_receipt_document_id_fk"
    FOREIGN KEY ("receipt_document_id") REFERENCES "documents"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_promoted_chronology_entry_id_fk"
    FOREIGN KEY ("promoted_to_chronology_entry_id")
    REFERENCES "medical_chronology_entries"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_reviewed_by_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_treatment_entries"
    ADD CONSTRAINT "client_treatment_entries_status_check"
    CHECK (status IN ('pending','merged','rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_client_treatment_entries_case"
  ON "client_treatment_entries" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_treatment_entries_status"
  ON "client_treatment_entries" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_treatment_entries_org_created"
  ON "client_treatment_entries" ("organization_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_treatment_entries_portal_user"
  ON "client_treatment_entries" ("portal_user_id");
--> statement-breakpoint
