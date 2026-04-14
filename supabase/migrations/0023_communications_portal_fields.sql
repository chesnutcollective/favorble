-- Wave 2: Client portal messaging + appointments (B1 + B5).
--
-- Adds the columns the portal pages need on top of the Wave 1 foundation:
--
--   communications.visible_to_client          — staff must opt-in per outbound
--                                                 message for it to render on
--                                                 the client portal. Inbound
--                                                 portal messages set it to
--                                                 true so the firm side can
--                                                 distinguish portal traffic
--                                                 from email/SMS.
--   communications.sent_by_portal_user_id     — portal_users.id of the claimant
--                                                 who sent this inbound message
--                                                 via the portal composer.
--
--   calendar_events.visible_to_client         — surface the event on the
--                                                 portal's /portal/appointments.
--   calendar_events.attendance_required       — shows a prominent "Attendance
--                                                 required" badge on the card.
--   calendar_events.client_location_text      — staff-authored location string
--                                                 shown to the client (falls
--                                                 back to `location`).
--   calendar_events.client_description        — staff-authored description
--                                                 shown to the client (falls
--                                                 back to `description`).
--   calendar_events.client_confirmed_at       — when the claimant clicked
--                                                 Confirm on the portal card.
--   calendar_events.client_confirmed_by       — portal_users.id that confirmed.
--
-- Idempotent: all ALTERs use IF NOT EXISTS / IF EXISTS guards so reruns are
-- safe, and the migration plays nicely on top of any hand-rolled column
-- that a previous iteration may have added.

-- ─────────────────────────────────────────────────────────────
-- communications
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "visible_to_client" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "sent_by_portal_user_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "communications"
    ADD CONSTRAINT "communications_sent_by_portal_user_id_fk"
    FOREIGN KEY ("sent_by_portal_user_id") REFERENCES "portal_users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comms_visible_to_client"
  ON "communications" ("visible_to_client");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comms_portal_sender"
  ON "communications" ("sent_by_portal_user_id");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- calendar_events
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "visible_to_client" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "attendance_required" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "client_location_text" text;
--> statement-breakpoint

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "client_description" text;
--> statement-breakpoint

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "client_confirmed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "client_confirmed_by" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "calendar_events"
    ADD CONSTRAINT "calendar_events_client_confirmed_by_fk"
    FOREIGN KEY ("client_confirmed_by") REFERENCES "portal_users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_events_visible_to_client"
  ON "calendar_events" ("visible_to_client");
--> statement-breakpoint
