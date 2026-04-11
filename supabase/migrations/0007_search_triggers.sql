-- Search triggers — phase 1.
--
-- Populates `search_documents` on INSERT/UPDATE/DELETE for every
-- searchable entity. Each trigger is idempotent via ON CONFLICT DO
-- UPDATE on the (entity_type, entity_id) unique key. Deletes soft-
-- delete the search row so the index stays queryable during the
-- transaction boundary and the ACL filter naturally hides them.
--
-- Conventions used by every trigger:
--   * `title`    = short human label, the primary display
--   * `subtitle` = secondary metadata, ~1 line
--   * `body`     = long-form searchable content (full OCR, notes, etc.)
--   * `facets`   = jsonb with denormalized status, stage, dates
--   * `identifiers` = array of exact-match strings for direct lookup
--   * Setting `embedding = NULL` on UPDATE signals the embedding worker
--     to re-embed the row.

-- ─── Helper: generic upsert builder ───────────────────────────────
--
-- We declare a single helper function that each entity trigger calls
-- with its already-built fields. Keeps the trigger bodies tiny.

CREATE OR REPLACE FUNCTION search_upsert(
  p_org_id              uuid,
  p_entity_type         text,
  p_entity_id           uuid,
  p_title               text,
  p_subtitle            text,
  p_body                text,
  p_allowed_roles       text[],
  p_owner_user_id       uuid,
  p_facets              jsonb,
  p_identifiers         text[],
  p_entity_updated_at   timestamptz
) RETURNS void AS $$
BEGIN
  INSERT INTO search_documents AS s (
    organization_id, entity_type, entity_id,
    title, subtitle, body,
    allowed_roles, owner_user_id, facets, identifiers,
    entity_updated_at, indexed_at, deleted_at
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    coalesce(nullif(p_title, ''), '(untitled)'),
    nullif(p_subtitle, ''),
    nullif(p_body, ''),
    coalesce(p_allowed_roles, ARRAY['attorney','case_manager','admin']::text[]),
    p_owner_user_id,
    coalesce(p_facets, '{}'::jsonb),
    nullif(p_identifiers, ARRAY[]::text[]),
    p_entity_updated_at,
    now(),
    NULL
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    title             = EXCLUDED.title,
    subtitle          = EXCLUDED.subtitle,
    body              = EXCLUDED.body,
    allowed_roles     = EXCLUDED.allowed_roles,
    owner_user_id     = EXCLUDED.owner_user_id,
    facets            = EXCLUDED.facets,
    identifiers       = EXCLUDED.identifiers,
    entity_updated_at = EXCLUDED.entity_updated_at,
    indexed_at        = now(),
    deleted_at        = NULL,
    -- Force re-embed whenever content changes.
    embedding         = NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_soft_delete(
  p_entity_type text,
  p_entity_id   uuid
) RETURNS void AS $$
BEGIN
  UPDATE search_documents
     SET deleted_at = now()
   WHERE entity_type = p_entity_type
     AND entity_id   = p_entity_id;
END $$ LANGUAGE plpgsql;

-- ─── cases ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_case() RETURNS trigger AS $$
DECLARE
  v_claimant text;
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('case', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT concat_ws(' ', c.first_name, c.last_name)
    INTO v_claimant
    FROM case_contacts cc
    JOIN contacts c ON c.id = cc.contact_id
   WHERE cc.case_id = NEW.id AND cc.is_primary = true
   LIMIT 1;

  PERFORM search_upsert(
    NEW.organization_id,
    'case',
    NEW.id,
    NEW.case_number,
    coalesce(v_claimant, ''),
    concat_ws(' ', NEW.admin_law_judge, NEW.hearing_office, NEW.ssa_office,
              NEW.application_type_primary, NEW.application_type_secondary),
    ARRAY['attorney','case_manager','intake_agent','intake','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'status',            NEW.status,
      'stage_id',          NEW.current_stage_id,
      'phi_sheet_status',  NEW.phi_sheet_status,
      'mr_status',         NEW.mr_status,
      'mr_team_color',     NEW.mr_team_color,
      'hearing_date',      NEW.hearing_date,
      'hearing_office',    NEW.hearing_office,
      'alj',               NEW.admin_law_judge,
      'app_type',          NEW.application_type_primary,
      'chronicle_id',      NEW.chronicle_claimant_id
    )),
    array_remove(ARRAY[
      NEW.case_number,
      NEW.ssa_claim_number,
      NEW.chronicle_claimant_id
    ]::text[], NULL),
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_case ON cases;
CREATE TRIGGER trg_search_case
AFTER INSERT OR UPDATE OR DELETE ON cases
FOR EACH ROW EXECUTE FUNCTION trg_search_case();

-- ─── contacts ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_contact() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('contact', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'contact',
    NEW.id,
    concat_ws(' ', NEW.last_name, NEW.first_name),
    nullif(concat_ws(' · ', NEW.contact_type, NEW.email, NEW.phone), ''),
    concat_ws(' ', NEW.address, NEW.city, NEW.state, NEW.zip),
    ARRAY['attorney','case_manager','intake_agent','intake','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'contact_type', NEW.contact_type,
      'has_email',    (NEW.email IS NOT NULL),
      'has_phone',    (NEW.phone IS NOT NULL),
      'state',        NEW.state
    )),
    array_remove(ARRAY[
      lower(NEW.email),
      regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g')
    ]::text[], NULL),
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_contact ON contacts;
CREATE TRIGGER trg_search_contact
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION trg_search_contact();

-- ─── leads ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_lead() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('lead', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'lead',
    NEW.id,
    concat_ws(' ', NEW.last_name, NEW.first_name),
    nullif(concat_ws(' · ', NEW.pipeline_stage, NEW.email, NEW.phone), ''),
    NEW.notes,
    ARRAY['attorney','case_manager','intake_agent','intake','admin']::text[],
    NEW.assigned_to_id,
    jsonb_strip_nulls(jsonb_build_object(
      'status',          NEW.status,
      'pipeline_stage',  NEW.pipeline_stage,
      'pipeline_group',  NEW.pipeline_stage_group,
      'assigned_to_id',  NEW.assigned_to_id,
      'source',          NEW.source,
      'converted',       (NEW.converted_to_case_id IS NOT NULL)
    )),
    array_remove(ARRAY[
      lower(NEW.email),
      regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g')
    ]::text[], NULL),
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_lead ON leads;
CREATE TRIGGER trg_search_lead
AFTER INSERT OR UPDATE OR DELETE ON leads
FOR EACH ROW EXECUTE FUNCTION trg_search_lead();

-- ─── users ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_user() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('user', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'user',
    NEW.id,
    concat_ws(' ', NEW.first_name, NEW.last_name),
    nullif(concat_ws(' · ', NEW.role, NEW.team, NEW.email), ''),
    NULL,
    ARRAY['attorney','case_manager','intake_agent','intake','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.id,
    jsonb_strip_nulls(jsonb_build_object(
      'role',       NEW.role,
      'team',       NEW.team,
      'is_active',  NEW.is_active
    )),
    array_remove(ARRAY[lower(NEW.email)]::text[], NULL),
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_user ON users;
CREATE TRIGGER trg_search_user
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION trg_search_user();

-- ─── documents ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_document() RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('document', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT organization_id INTO v_org_id FROM cases WHERE id = NEW.case_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM search_upsert(
    v_org_id,
    'document',
    NEW.id,
    NEW.file_name,
    nullif(concat_ws(' · ', NEW.category, NEW.source), ''),
    concat_ws(' ', NEW.description, array_to_string(NEW.tags, ' ')),
    ARRAY['attorney','case_manager','intake_agent','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'case_id',         NEW.case_id,
      'category',        NEW.category,
      'source',          NEW.source,
      'is_confidential', NEW.is_confidential
    )),
    array_remove(ARRAY[NEW.source_external_id]::text[], NULL),
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_document ON documents;
CREATE TRIGGER trg_search_document
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION trg_search_document();

-- ─── chronology entries ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_chronology() RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('chronology_entry', OLD.id);
    RETURN OLD;
  END IF;

  SELECT organization_id INTO v_org_id FROM cases WHERE id = NEW.case_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM search_upsert(
    v_org_id,
    'chronology_entry',
    NEW.id,
    coalesce(NEW.summary, '(chronology entry)'),
    nullif(concat_ws(' · ',
      to_char(NEW.event_date, 'YYYY-MM-DD'),
      NEW.provider_name,
      NEW.facility_name
    ), ''),
    concat_ws(
      ' ',
      NEW.details,
      array_to_string(NEW.diagnoses, ' '),
      array_to_string(NEW.treatments, ' '),
      array_to_string(NEW.medications, ' ')
    ),
    ARRAY['attorney','case_manager','medical_records','phi_sheet_writer',
          'reviewer','admin']::text[],
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'case_id',       NEW.case_id,
      'entry_type',    NEW.entry_type,
      'event_date',    NEW.event_date,
      'is_verified',   NEW.is_verified,
      'provider_type', NEW.provider_type
    )),
    NEW.diagnoses,
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_chronology ON medical_chronology_entries;
CREATE TRIGGER trg_search_chronology
AFTER INSERT OR UPDATE OR DELETE ON medical_chronology_entries
FOR EACH ROW EXECUTE FUNCTION trg_search_chronology();

-- ─── calendar events ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_calendar() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('calendar_event', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'calendar_event',
    NEW.id,
    NEW.title,
    nullif(concat_ws(' · ',
      to_char(NEW.start_at, 'YYYY-MM-DD HH24:MI'),
      NEW.hearing_office,
      NEW.admin_law_judge
    ), ''),
    concat_ws(' ', NEW.description, NEW.location),
    ARRAY['attorney','case_manager','intake_agent','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'event_type',     NEW.event_type,
      'case_id',        NEW.case_id,
      'start_at',       NEW.start_at,
      'hearing_office', NEW.hearing_office,
      'alj',            NEW.admin_law_judge
    )),
    NULL,
    coalesce(NEW.updated_at, NEW.start_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_calendar ON calendar_events;
CREATE TRIGGER trg_search_calendar
AFTER INSERT OR UPDATE OR DELETE ON calendar_events
FOR EACH ROW EXECUTE FUNCTION trg_search_calendar();

-- ─── tasks ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_task() RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    PERFORM search_soft_delete('task', COALESCE(OLD.id, NEW.id));
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT organization_id INTO v_org_id FROM cases WHERE id = NEW.case_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM search_upsert(
    v_org_id,
    'task',
    NEW.id,
    NEW.title,
    nullif(concat_ws(' · ', NEW.priority, to_char(NEW.due_date, 'YYYY-MM-DD')), ''),
    NEW.description,
    ARRAY['attorney','case_manager','intake_agent','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.assigned_to_id,
    jsonb_strip_nulls(jsonb_build_object(
      'status',         NEW.status,
      'priority',       NEW.priority,
      'due_date',       NEW.due_date,
      'assigned_to_id', NEW.assigned_to_id,
      'case_id',        NEW.case_id
    )),
    NULL,
    coalesce(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_task ON tasks;
CREATE TRIGGER trg_search_task
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION trg_search_task();

-- ─── communications (email + message) ───────────────────────────

CREATE OR REPLACE FUNCTION trg_search_communication() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('communication', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'communication',
    NEW.id,
    coalesce(nullif(NEW.subject, ''), left(coalesce(NEW.body, '(no subject)'), 80)),
    nullif(concat_ws(' · ', NEW.type, NEW.from_address, NEW.to_address), ''),
    NEW.body,
    ARRAY['attorney','case_manager','admin']::text[],
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'type',      NEW.type,
      'direction', NEW.direction,
      'case_id',   NEW.case_id,
      'matched',   (NEW.case_id IS NOT NULL)
    )),
    array_remove(ARRAY[
      lower(NEW.from_address),
      lower(NEW.to_address)
    ]::text[], NULL),
    coalesce(NEW.created_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_communication ON communications;
CREATE TRIGGER trg_search_communication
AFTER INSERT OR UPDATE OR DELETE ON communications
FOR EACH ROW EXECUTE FUNCTION trg_search_communication();

-- ─── chat messages (internal only, team_chat scope) ─────────────

CREATE OR REPLACE FUNCTION trg_search_chat() RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('chat_message', OLD.id);
    RETURN OLD;
  END IF;

  SELECT organization_id INTO v_org_id FROM chat_channels WHERE id = NEW.channel_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM search_upsert(
    v_org_id,
    'chat_message',
    NEW.id,
    left(coalesce(NEW.content, ''), 80),
    NULL,
    NEW.content,
    ARRAY['attorney','case_manager','intake_agent','intake','medical_records',
          'phi_sheet_writer','reviewer','admin']::text[],
    NEW.user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'channel_id', NEW.channel_id,
      'author_id',  NEW.user_id
    )),
    NULL,
    coalesce(NEW.created_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_chat ON chat_messages;
CREATE TRIGGER trg_search_chat
AFTER INSERT OR UPDATE OR DELETE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION trg_search_chat();

-- ─── outbound mail ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_outbound_mail() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('outbound_mail', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'outbound_mail',
    NEW.id,
    NEW.recipient_name,
    nullif(concat_ws(' · ', NEW.mail_type, NEW.tracking_number), ''),
    concat_ws(' ', NEW.recipient_address, NEW.notes),
    ARRAY['attorney','case_manager','intake_agent','admin']::text[],
    NEW.sent_by,
    jsonb_strip_nulls(jsonb_build_object(
      'mail_type',  NEW.mail_type,
      'case_id',    NEW.case_id,
      'delivered',  (NEW.delivered_at IS NOT NULL)
    )),
    array_remove(ARRAY[NEW.tracking_number]::text[], NULL),
    coalesce(NEW.created_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_outbound_mail ON outbound_mail;
CREATE TRIGGER trg_search_outbound_mail
AFTER INSERT OR UPDATE OR DELETE ON outbound_mail
FOR EACH ROW EXECUTE FUNCTION trg_search_outbound_mail();

-- ─── invoices ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_invoice() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('invoice', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM search_upsert(
    NEW.organization_id,
    'invoice',
    NEW.id,
    NEW.invoice_number,
    nullif(concat_ws(' · ', NEW.status, (NEW.total_cents / 100.0)::text), ''),
    NEW.notes,
    ARRAY['billing_owner','attorney','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'status',      NEW.status,
      'total_cents', NEW.total_cents,
      'due_date',    NEW.due_date,
      'paid_date',   NEW.paid_date,
      'case_id',     NEW.case_id
    )),
    array_remove(ARRAY[NEW.invoice_number]::text[], NULL),
    coalesce(NEW.updated_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_invoice ON invoices;
CREATE TRIGGER trg_search_invoice
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION trg_search_invoice();

-- ─── trust transactions ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_search_trust_tx() RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_soft_delete('trust_transaction', OLD.id);
    RETURN OLD;
  END IF;

  SELECT organization_id INTO v_org_id FROM trust_accounts WHERE id = NEW.trust_account_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM search_upsert(
    v_org_id,
    'trust_transaction',
    NEW.id,
    coalesce(nullif(NEW.description, ''), NEW.reference_number, 'Trust transaction'),
    nullif(concat_ws(' · ',
      NEW.transaction_type,
      (NEW.amount_cents / 100.0)::text,
      to_char(NEW.transaction_date, 'YYYY-MM-DD')
    ), ''),
    NEW.description,
    ARRAY['billing_owner','admin']::text[],
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'transaction_type', NEW.transaction_type,
      'amount_cents',     NEW.amount_cents,
      'reconciled',       NEW.reconciled,
      'client_id',        NEW.client_contact_id,
      'case_id',          NEW.case_id
    )),
    array_remove(ARRAY[NEW.reference_number]::text[], NULL),
    coalesce(NEW.created_at, now())
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_trust_tx ON trust_transactions;
CREATE TRIGGER trg_search_trust_tx
AFTER INSERT OR UPDATE OR DELETE ON trust_transactions
FOR EACH ROW EXECUTE FUNCTION trg_search_trust_tx();
