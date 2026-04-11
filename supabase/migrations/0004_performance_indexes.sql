-- Wave 5 performance optimization pass.
--
-- These partial indexes target the hottest queries in the app:
--   * Case list (org + status, live rows only)
--   * Work queue (assignee + status + due date, live rows only)
--   * Documents by case + source (case detail page, filing agents)
--   * Contact search by type (contact list + case detail panels)
--   * Case timeline / communications
--
-- All indexes are created `IF NOT EXISTS` so this migration is safe to
-- re-run. They all use `WHERE deleted_at IS NULL` so soft-deleted rows never
-- contribute to the index size — this keeps them tight and fast.
--
-- NOTE: Postgres does not support `CREATE INDEX CONCURRENTLY` inside a
-- migration transaction. If these indexes need to be applied to a large
-- production table without blocking writes, run them manually with
-- CONCURRENTLY outside this migration.

CREATE INDEX IF NOT EXISTS idx_cases_org_status_active
  ON cases(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_due
  ON tasks(assigned_to_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_case_source
  ON documents(case_id, source)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_org_type
  ON contacts(organization_id, contact_type)
  WHERE deleted_at IS NULL;

-- communications has no soft-delete column, so no partial predicate.
CREATE INDEX IF NOT EXISTS idx_communications_case_created
  ON communications(case_id, created_at DESC);
