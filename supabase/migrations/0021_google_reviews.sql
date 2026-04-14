-- C4: Google Reviews integration surface.
--
-- Adds two tables:
--   * google_reviews    — rows pulled from Google Business Profile once the
--                         OAuth integration ships. Empty until then.
--   * review_requests   — audit log of "leave us a review" prompts sent by
--                         the firm to a claimant. Written even when the
--                         actual send channel isn't wired up yet, so we can
--                         track intent separately from delivery.
--
-- Migration is idempotent (IF NOT EXISTS) so it's safe to re-run during
-- iteration.

CREATE TABLE IF NOT EXISTS google_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id),
  place_id             text NOT NULL,
  external_review_id   text NOT NULL,
  reviewer_name        text,
  rating               integer NOT NULL,
  comment              text,
  posted_at            timestamp with time zone NOT NULL,
  fetched_at           timestamp with time zone NOT NULL DEFAULT now(),
  responded_at         timestamp with time zone,
  response             text,
  matched_case_id      uuid REFERENCES cases(id),
  CONSTRAINT google_reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_reviews_external_id
  ON google_reviews(external_review_id);

CREATE INDEX IF NOT EXISTS idx_google_reviews_org_posted
  ON google_reviews(organization_id, posted_at);

CREATE INDEX IF NOT EXISTS idx_google_reviews_case
  ON google_reviews(matched_case_id);


CREATE TABLE IF NOT EXISTS review_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id),
  case_id              uuid NOT NULL REFERENCES cases(id),
  contact_id           uuid NOT NULL REFERENCES contacts(id),
  channel              text NOT NULL,
  sent_at              timestamp with time zone,
  clicked_at           timestamp with time zone,
  completed_at         timestamp with time zone,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL REFERENCES users(id),
  CONSTRAINT review_requests_channel_check
    CHECK (channel IN ('sms', 'email', 'in_portal'))
);

CREATE INDEX IF NOT EXISTS idx_review_requests_org
  ON review_requests(organization_id);

CREATE INDEX IF NOT EXISTS idx_review_requests_case
  ON review_requests(case_id);

CREATE INDEX IF NOT EXISTS idx_review_requests_channel
  ON review_requests(channel);
