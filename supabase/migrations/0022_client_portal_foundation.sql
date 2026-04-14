-- Wave 1: Client portal foundation.
--
-- Three tables + one column:
--   * portal_users            — bridge between a Clerk auth user (role=client)
--                               and a Favorble contact.
--   * client_invitations      — accept-tokens generated when staff sends an invite.
--                               Tokens are stored as SHA-256 hashes; raw value
--                               only lives in the invite URL.
--   * portal_activity_events  — append-only log of portal-side user activity
--                               (logins, page views, messages sent, NPS submits).
--
--   * contacts.preferred_locale — claimant's preferred portal/comms locale.
--                                 Defaults to 'en' for every existing row.
--
-- Idempotent (IF NOT EXISTS) so re-runs during iteration are safe.

-- ─────────────────────────────────────────────────────────────
-- contacts.preferred_locale (add column if missing)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "preferred_locale" text NOT NULL DEFAULT 'en';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- portal_users
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "portal_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "auth_user_id" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "status" text NOT NULL DEFAULT 'invited',
  "preferred_locale" text NOT NULL DEFAULT 'en',
  "invited_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "login_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_users"
    ADD CONSTRAINT "portal_users_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_users"
    ADD CONSTRAINT "portal_users_contact_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_users"
    ADD CONSTRAINT "portal_users_status_check"
    CHECK (status IN ('invited','active','suspended','deactivated'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_users_contact"
  ON "portal_users" ("contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_users_auth"
  ON "portal_users" ("auth_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_users_org"
  ON "portal_users" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_users_email"
  ON "portal_users" ("email");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- client_invitations
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "client_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "channel" text NOT NULL DEFAULT 'email',
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "sent_by" uuid,
  "clerk_invitation_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_invitations"
    ADD CONSTRAINT "client_invitations_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_invitations"
    ADD CONSTRAINT "client_invitations_case_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_invitations"
    ADD CONSTRAINT "client_invitations_contact_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_invitations"
    ADD CONSTRAINT "client_invitations_sent_by_fk"
    FOREIGN KEY ("sent_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "client_invitations"
    ADD CONSTRAINT "client_invitations_channel_check"
    CHECK (channel IN ('email','sms'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_invitations_token"
  ON "client_invitations" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_invitations_org"
  ON "client_invitations" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_invitations_case"
  ON "client_invitations" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_invitations_contact"
  ON "client_invitations" ("contact_id");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- portal_activity_events
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "portal_activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "portal_user_id" uuid NOT NULL,
  "case_id" uuid,
  "event_type" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_activity_events"
    ADD CONSTRAINT "portal_activity_events_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_activity_events"
    ADD CONSTRAINT "portal_activity_events_portal_user_id_fk"
    FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "portal_activity_events"
    ADD CONSTRAINT "portal_activity_events_case_id_fk"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_portal_events_org_created"
  ON "portal_activity_events" ("organization_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_events_user_created"
  ON "portal_activity_events" ("portal_user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_events_case_created"
  ON "portal_activity_events" ("case_id", "created_at" DESC);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- Seed data — Wave 2 agents need a row to test against.
--
-- We pick ANY existing claimant contact that does not yet have a
-- portal_users row, plus the first case linked to them. The insert is
-- NO-OP if there are no claimants yet (the subselect returns zero rows).
-- auth_user_id uses a stable sentinel Clerk id so Wave 2 can match it.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  _seed_contact_id uuid;
  _seed_org_id uuid;
  _seed_case_id uuid;
  _seed_portal_user_id uuid;
BEGIN
  SELECT c.id, c.organization_id INTO _seed_contact_id, _seed_org_id
  FROM contacts c
  WHERE c.contact_type = 'claimant'
    AND NOT EXISTS (SELECT 1 FROM portal_users pu WHERE pu.contact_id = c.id)
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF _seed_contact_id IS NOT NULL THEN
    SELECT cc.case_id INTO _seed_case_id
    FROM case_contacts cc
    WHERE cc.contact_id = _seed_contact_id
    LIMIT 1;

    INSERT INTO portal_users (
      organization_id,
      contact_id,
      auth_user_id,
      email,
      status,
      invited_at
    )
    SELECT
      _seed_org_id,
      _seed_contact_id,
      'user_seed_wave1_placeholder',
      COALESCE(c.email, 'seed.claimant@example.com'),
      'invited',
      now()
    FROM contacts c
    WHERE c.id = _seed_contact_id
    RETURNING id INTO _seed_portal_user_id;

    IF _seed_portal_user_id IS NOT NULL THEN
      INSERT INTO portal_activity_events (
        organization_id,
        portal_user_id,
        case_id,
        event_type,
        metadata
      ) VALUES (
        _seed_org_id,
        _seed_portal_user_id,
        _seed_case_id,
        'seed_login',
        '{"source": "migration_0022_seed"}'::jsonb
      );
    END IF;
  END IF;
END $$;
