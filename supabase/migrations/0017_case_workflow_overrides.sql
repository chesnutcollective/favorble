-- D2: Per-case workflow overrides.
--
-- Lets a user disable a specific workflow template for a single case without
-- affecting the global template. The workflow engine should LEFT JOIN this
-- table when deciding whether to fire a workflow for a given case.

CREATE TABLE IF NOT EXISTS "case_workflow_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "disabled" boolean NOT NULL DEFAULT true,
  "disabled_by" uuid,
  "disabled_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Foreign keys (guarded so the migration is idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'case_workflow_overrides'
       AND constraint_name = 'case_workflow_overrides_case_id_cases_id_fk'
  ) THEN
    ALTER TABLE "case_workflow_overrides"
      ADD CONSTRAINT "case_workflow_overrides_case_id_cases_id_fk"
      FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'case_workflow_overrides'
       AND constraint_name = 'case_workflow_overrides_template_id_workflow_templates_id_fk'
  ) THEN
    ALTER TABLE "case_workflow_overrides"
      ADD CONSTRAINT "case_workflow_overrides_template_id_workflow_templates_id_fk"
      FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'case_workflow_overrides'
       AND constraint_name = 'case_workflow_overrides_disabled_by_users_id_fk'
  ) THEN
    ALTER TABLE "case_workflow_overrides"
      ADD CONSTRAINT "case_workflow_overrides_disabled_by_users_id_fk"
      FOREIGN KEY ("disabled_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_case_wf_overrides_case"
  ON "case_workflow_overrides"("case_id");

CREATE INDEX IF NOT EXISTS "idx_case_wf_overrides_template"
  ON "case_workflow_overrides"("template_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_case_wf_overrides_case_template"
  ON "case_workflow_overrides"("case_id", "template_id");
