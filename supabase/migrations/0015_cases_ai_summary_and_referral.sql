-- CaseStatus-parity feature trio:
--   D1: persist AI-generated case summary on the case row so it can be
--       rendered directly on the overview (no on-demand regeneration).
--   E9: referral source (free-text source label + optional contact linkage).
--
-- All columns are nullable / have defaults so this migration is safe to run
-- against a live production database without backfills.

ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "ai_summary" text,
  ADD COLUMN IF NOT EXISTS "ai_summary_generated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ai_summary_model" text,
  ADD COLUMN IF NOT EXISTS "ai_summary_version" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referral_source" text,
  ADD COLUMN IF NOT EXISTS "referral_contact_id" uuid;

-- FK on referral_contact_id — declared in SQL because the Drizzle schema
-- cannot express this reference without introducing a circular import
-- between cases.ts and contacts.ts (contacts already imports cases for the
-- case_contacts join table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints
     WHERE table_name = 'cases'
       AND constraint_name = 'cases_referral_contact_id_contacts_id_fk'
  ) THEN
    ALTER TABLE "cases"
      ADD CONSTRAINT "cases_referral_contact_id_contacts_id_fk"
      FOREIGN KEY ("referral_contact_id")
      REFERENCES "contacts"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cases_ai_summary_generated_at"
  ON "cases"("ai_summary_generated_at")
  WHERE "ai_summary_generated_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_cases_referral_contact"
  ON "cases"("referral_contact_id")
  WHERE "referral_contact_id" IS NOT NULL;
