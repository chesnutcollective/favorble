-- Enable Row Level Security on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stage_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get the current user's organization_id from the users table
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Helper function: get the current user's app-level user id
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Helper function: get the current user's role
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- Organizations: users can only see their own org
-- ============================================================
CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (id = public.user_org_id());

-- ============================================================
-- Users: org-scoped access
-- ============================================================
CREATE POLICY "Users can view users in their organization"
  ON users FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage users in their organization"
  ON users FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

-- ============================================================
-- Leads: org-scoped
-- ============================================================
CREATE POLICY "Users can view leads in their organization"
  ON leads FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create leads in their organization"
  ON leads FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

CREATE POLICY "Users can update leads in their organization"
  ON leads FOR UPDATE
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Cases: org-scoped
-- ============================================================
CREATE POLICY "Users can view cases in their organization"
  ON cases FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create cases in their organization"
  ON cases FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

CREATE POLICY "Users can update cases in their organization"
  ON cases FOR UPDATE
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Case Stage Groups & Stages: org-scoped
-- ============================================================
CREATE POLICY "Users can view stage groups in their organization"
  ON case_stage_groups FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage stage groups"
  ON case_stage_groups FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

CREATE POLICY "Users can view stages in their organization"
  ON case_stages FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage stages"
  ON case_stages FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

-- ============================================================
-- Case Assignments: scoped via case org
-- ============================================================
CREATE POLICY "Users can view assignments for cases in their org"
  ON case_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_assignments.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can manage assignments for cases in their org"
  ON case_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_assignments.case_id
        AND cases.organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_assignments.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Case Stage Transitions: scoped via case org
-- ============================================================
CREATE POLICY "Users can view transitions for cases in their org"
  ON case_stage_transitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_stage_transitions.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can create transitions for cases in their org"
  ON case_stage_transitions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_stage_transitions.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Contacts: org-scoped
-- ============================================================
CREATE POLICY "Users can view contacts in their organization"
  ON contacts FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can manage contacts in their organization"
  ON contacts FOR ALL
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Case Contacts: scoped via case org
-- ============================================================
CREATE POLICY "Users can view case contacts for cases in their org"
  ON case_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_contacts.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can manage case contacts for cases in their org"
  ON case_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_contacts.case_id
        AND cases.organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = case_contacts.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Custom Field Definitions: org-scoped
-- ============================================================
CREATE POLICY "Users can view field definitions in their organization"
  ON custom_field_definitions FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage field definitions"
  ON custom_field_definitions FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

-- ============================================================
-- Custom Field Values: scoped via case org
-- ============================================================
CREATE POLICY "Users can view field values for cases in their org"
  ON custom_field_values FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = custom_field_values.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can manage field values for cases in their org"
  ON custom_field_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = custom_field_values.case_id
        AND cases.organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = custom_field_values.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Workflow Templates: org-scoped
-- ============================================================
CREATE POLICY "Users can view workflow templates in their organization"
  ON workflow_templates FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage workflow templates"
  ON workflow_templates FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

-- ============================================================
-- Workflow Task Templates: scoped via workflow org
-- ============================================================
CREATE POLICY "Users can view workflow task templates in their org"
  ON workflow_task_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflow_templates WHERE workflow_templates.id = workflow_task_templates.workflow_template_id
        AND workflow_templates.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Admins can manage workflow task templates"
  ON workflow_task_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workflow_templates WHERE workflow_templates.id = workflow_task_templates.workflow_template_id
        AND workflow_templates.organization_id = public.user_org_id()
    ) AND public.user_role() = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflow_templates WHERE workflow_templates.id = workflow_task_templates.workflow_template_id
        AND workflow_templates.organization_id = public.user_org_id()
    ) AND public.user_role() = 'admin'
  );

-- ============================================================
-- Tasks: org-scoped
-- ============================================================
CREATE POLICY "Users can view tasks in their organization"
  ON tasks FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create tasks in their organization"
  ON tasks FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

CREATE POLICY "Users can update tasks in their organization"
  ON tasks FOR UPDATE
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Documents: org-scoped
-- ============================================================
CREATE POLICY "Users can view documents in their organization"
  ON documents FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create documents in their organization"
  ON documents FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

CREATE POLICY "Users can update documents in their organization"
  ON documents FOR UPDATE
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Document Templates: org-scoped
-- ============================================================
CREATE POLICY "Users can view document templates in their organization"
  ON document_templates FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Admins can manage document templates"
  ON document_templates FOR ALL
  USING (organization_id = public.user_org_id() AND public.user_role() = 'admin')
  WITH CHECK (organization_id = public.user_org_id() AND public.user_role() = 'admin');

-- ============================================================
-- Signature Requests: scoped via case org
-- ============================================================
CREATE POLICY "Users can view signature requests for cases in their org"
  ON signature_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = signature_requests.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can manage signature requests for cases in their org"
  ON signature_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = signature_requests.case_id
        AND cases.organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases WHERE cases.id = signature_requests.case_id
        AND cases.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Communications: org-scoped
-- ============================================================
CREATE POLICY "Users can view communications in their organization"
  ON communications FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create communications in their organization"
  ON communications FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Calendar Events: org-scoped
-- ============================================================
CREATE POLICY "Users can view calendar events in their organization"
  ON calendar_events FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "Users can create calendar events in their organization"
  ON calendar_events FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

CREATE POLICY "Users can update calendar events in their organization"
  ON calendar_events FOR UPDATE
  USING (organization_id = public.user_org_id())
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Calendar Event Attendees: scoped via event org
-- ============================================================
CREATE POLICY "Users can view attendees for events in their org"
  ON calendar_event_attendees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM calendar_events WHERE calendar_events.id = calendar_event_attendees.event_id
        AND calendar_events.organization_id = public.user_org_id()
    )
  );

CREATE POLICY "Users can manage attendees for events in their org"
  ON calendar_event_attendees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM calendar_events WHERE calendar_events.id = calendar_event_attendees.event_id
        AND calendar_events.organization_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calendar_events WHERE calendar_events.id = calendar_event_attendees.event_id
        AND calendar_events.organization_id = public.user_org_id()
    )
  );

-- ============================================================
-- Audit Log: org-scoped, read-only for non-admins
-- ============================================================
CREATE POLICY "Users can view audit log for their organization"
  ON audit_log FOR SELECT
  USING (organization_id = public.user_org_id());

CREATE POLICY "System can insert audit log entries"
  ON audit_log FOR INSERT
  WITH CHECK (organization_id = public.user_org_id());

-- ============================================================
-- Service role bypass: allow server-side operations
-- ============================================================
-- Note: The service_role key bypasses RLS automatically in Supabase.
-- The policies above apply to anon and authenticated roles only.
-- Server actions using the service role key will have full access.
