-- B4 — Inbox triage fields on communications
--   urgency       : low | normal | high | urgent  (default: normal)
--   category      : question | document_request | complaint | status_update
--                  | scheduling | medical | billing | other  (nullable)
--   is_automated  : bool, used by D3 follow-up to skip workflow-sent msgs
--   source_type   : provenance label — "workflow:{templateId}", "human",
--                  "case_status", etc. Nullable.
--
-- All columns nullable or defaulted so this migration is safe to run
-- against a live production database without a backfill.

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "urgency"      text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "category"     text,
  ADD COLUMN IF NOT EXISTS "is_automated" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "source_type"  text;

CREATE INDEX IF NOT EXISTS "idx_comms_urgency"
  ON "communications"("urgency")
  WHERE "urgency" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_comms_category"
  ON "communications"("category")
  WHERE "category" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_comms_is_automated"
  ON "communications"("is_automated");
