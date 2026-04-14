-- D4 — Stage-scoped checklist + advance gating.
--
-- Adds:
--   1. `case_stages.client_checklist_items` — JSONB array of items
--      ({ key, label, required }) that define the checklist shape per stage.
--   2. `case_checklist_progress` — per-case, per-stage item status.
--
-- Required items (`required: true`) must be marked `done` on a case before
-- `changeCaseStage` will move the case off of that stage (enforced in
-- application code; see app/actions/cases.ts).

ALTER TABLE "case_stages"
  ADD COLUMN IF NOT EXISTS "client_checklist_items" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "case_checklist_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL REFERENCES "cases"("id"),
  "stage_id" uuid NOT NULL REFERENCES "case_stages"("id"),
  "item_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "completed_by" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_checklist_progress_case"
  ON "case_checklist_progress"("case_id");

CREATE INDEX IF NOT EXISTS "idx_checklist_progress_case_stage"
  ON "case_checklist_progress"("case_id", "stage_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_checklist_progress_case_stage_item"
  ON "case_checklist_progress"("case_id", "stage_id", "item_key");

-- Seed: attach a small, realistic required checklist to a handful of stages
-- so the feature demos out of the box. We seed by stage code, which is
-- organization-scoped-unique, and update every org that has a stage with that
-- code. Idempotent: we only overwrite stages whose checklist is still the
-- default empty array.

-- 1A "Signed Up" — intake must be complete before leaving onboarding.
UPDATE "case_stages"
   SET "client_checklist_items" = '[
     {"key":"retainer_signed","label":"Retainer agreement signed","required":true},
     {"key":"ssn_on_file","label":"SSN captured and encrypted","required":true},
     {"key":"contact_verified","label":"Phone and email verified","required":false}
   ]'::jsonb
 WHERE "code" = '1A'
   AND ("client_checklist_items" IS NULL OR "client_checklist_items" = '[]'::jsonb);

-- 2A "Application Ready to File" — pre-file gating.
UPDATE "case_stages"
   SET "client_checklist_items" = '[
     {"key":"medical_history_collected","label":"Medical history collected","required":true},
     {"key":"work_history_collected","label":"Work history (SSA-3369) complete","required":true},
     {"key":"adl_questionnaire","label":"ADL questionnaire on file","required":false}
   ]'::jsonb
 WHERE "code" = '2A'
   AND ("client_checklist_items" IS NULL OR "client_checklist_items" = '[]'::jsonb);

-- 4B "Request for Hearing - Ready to File" — pre-RFH gating.
UPDATE "case_stages"
   SET "client_checklist_items" = '[
     {"key":"rfh_form_drafted","label":"HA-501 drafted and reviewed","required":true},
     {"key":"client_authorization","label":"Client authorization obtained","required":true}
   ]'::jsonb
 WHERE "code" = '4B'
   AND ("client_checklist_items" IS NULL OR "client_checklist_items" = '[]'::jsonb);
