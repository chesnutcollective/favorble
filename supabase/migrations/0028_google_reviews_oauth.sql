-- C4 Phase 5: Google Business Profile OAuth + review request template.
--
-- Extends the read-only C4 schema shipped in 0021 with:
--   * google_oauth_connections — stores the OAuth tokens, resolved Place/
--     account/location IDs, and the "starting count" baseline so the
--     Reviews dashboard can show delta-since-connect metrics.
--   * organizations.review_request_template — optional per-org SMS/email
--     body override. Left NULL means "use default template from code".
--
-- Idempotent: safe to re-run during iteration.

CREATE TABLE IF NOT EXISTS google_oauth_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL UNIQUE REFERENCES organizations(id),
  access_token            text NOT NULL,
  refresh_token           text NOT NULL,
  token_expires_at        timestamp with time zone,
  place_id                text,
  account_id              text,
  location_id             text,
  starting_review_count   integer NOT NULL DEFAULT 0,
  connected_at            timestamp with time zone NOT NULL DEFAULT now(),
  connected_by            uuid NOT NULL REFERENCES users(id),
  last_sync_at            timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_org
  ON google_oauth_connections(organization_id);

-- Per-org custom review-request message. NULL falls back to the built-in
-- default body at send time.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS review_request_template text;
