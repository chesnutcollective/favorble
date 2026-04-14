-- Phase 6: Rollup materialized views.
--
-- Two read-side views used by the analytics dashboards. Refresh cadence is
-- driven by cron (nightly REFRESH MATERIALIZED VIEW CONCURRENTLY once the
-- follow-up dashboard wiring lands). These are intentionally simple today —
-- they encode the aggregations the dashboards already compute inline, just
-- precomputed so the UI doesn't scan tens of thousands of rows on every
-- page load.
--
-- Views:
--   * staff_activity_daily    — per-user daily activity buckets rolled up
--                                from communications + ai_drafts. login_count
--                                is sourced from audit_log rows with
--                                action='user_login'.
--   * message_analytics_daily — communications rollup by day (inbound /
--                                outbound / automated counts + avg response
--                                time). Keyed on org so the dashboards can
--                                scope cheaply.
--
-- The views are CONCURRENTLY-refreshable because they each carry a UNIQUE
-- index on their natural key tuple.
--
-- Idempotent (DROP MATERIALIZED VIEW IF EXISTS before CREATE). We don't use
-- CREATE MATERIALIZED VIEW IF NOT EXISTS because that leaves stale
-- definitions in place if the underlying query ever evolves.

-- ─────────────────────────────────────────────────────────────
-- staff_activity_daily
-- ─────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS "staff_activity_daily";
--> statement-breakpoint

CREATE MATERIALIZED VIEW "staff_activity_daily" AS
WITH msg_rollup AS (
  SELECT
    c.organization_id,
    c.user_id AS user_id,
    (c.created_at AT TIME ZONE 'UTC')::date AS activity_date,
    COUNT(*) FILTER (
      WHERE c.direction = 'outbound'
        AND COALESCE(c.is_automated, false) = false
    )::int AS messages_sent,
    AVG(c.response_time_seconds) FILTER (
      WHERE c.response_time_seconds IS NOT NULL
    )::int AS response_time_avg
  FROM communications c
  WHERE c.user_id IS NOT NULL
  GROUP BY c.organization_id, c.user_id, activity_date
),
draft_rollup AS (
  SELECT
    d.organization_id,
    d.approved_by AS user_id,
    (COALESCE(d.approved_at, d.created_at) AT TIME ZONE 'UTC')::date AS activity_date,
    COUNT(*) FILTER (WHERE d.status = 'approved')::int AS ai_drafts_approved
  FROM ai_drafts d
  WHERE d.approved_by IS NOT NULL
  GROUP BY d.organization_id, d.approved_by, activity_date
),
login_rollup AS (
  SELECT
    a.organization_id,
    a.user_id,
    (a.created_at AT TIME ZONE 'UTC')::date AS activity_date,
    COUNT(*)::int AS login_count
  FROM audit_log a
  WHERE a.action IN ('user_login', 'login', 'session_start')
    AND a.user_id IS NOT NULL
  GROUP BY a.organization_id, a.user_id, activity_date
)
SELECT
  COALESCE(m.organization_id, d.organization_id, l.organization_id) AS organization_id,
  COALESCE(m.user_id, d.user_id, l.user_id) AS user_id,
  COALESCE(m.activity_date, d.activity_date, l.activity_date) AS activity_date,
  COALESCE(m.messages_sent, 0) AS messages_sent,
  m.response_time_avg,
  COALESCE(d.ai_drafts_approved, 0) AS ai_drafts_approved,
  COALESCE(l.login_count, 0) AS login_count
FROM msg_rollup m
FULL OUTER JOIN draft_rollup d
  ON d.organization_id = m.organization_id
 AND d.user_id = m.user_id
 AND d.activity_date = m.activity_date
FULL OUTER JOIN login_rollup l
  ON l.organization_id = COALESCE(m.organization_id, d.organization_id)
 AND l.user_id = COALESCE(m.user_id, d.user_id)
 AND l.activity_date = COALESCE(m.activity_date, d.activity_date)
WHERE COALESCE(m.organization_id, d.organization_id, l.organization_id) IS NOT NULL
  AND COALESCE(m.user_id, d.user_id, l.user_id) IS NOT NULL
  AND COALESCE(m.activity_date, d.activity_date, l.activity_date) IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_staff_activity_daily_unique"
  ON "staff_activity_daily" ("organization_id", "user_id", "activity_date");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_staff_activity_daily_org_date"
  ON "staff_activity_daily" ("organization_id", "activity_date" DESC);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- message_analytics_daily
-- ─────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS "message_analytics_daily";
--> statement-breakpoint

CREATE MATERIALIZED VIEW "message_analytics_daily" AS
SELECT
  c.organization_id,
  (c.created_at AT TIME ZONE 'UTC')::date AS activity_date,
  COUNT(*) FILTER (WHERE c.direction = 'inbound')::int AS inbound_count,
  COUNT(*) FILTER (
    WHERE c.direction = 'outbound'
      AND COALESCE(c.is_automated, false) = false
  )::int AS outbound_count,
  COUNT(*) FILTER (WHERE COALESCE(c.is_automated, false) = true)::int AS automated_count,
  COUNT(*)::int AS total_count,
  AVG(c.response_time_seconds) FILTER (
    WHERE c.response_time_seconds IS NOT NULL
  )::int AS response_time_avg_seconds
FROM communications c
GROUP BY c.organization_id, activity_date;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_analytics_daily_unique"
  ON "message_analytics_daily" ("organization_id", "activity_date");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_message_analytics_daily_date"
  ON "message_analytics_daily" ("activity_date" DESC);
--> statement-breakpoint
