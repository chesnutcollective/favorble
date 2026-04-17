/**
 * Human-label helpers — turn snake_case system tokens into auditor-friendly
 * display copy. Used by the audit-logs table, the dashboard live ticker, and
 * anywhere else raw machine identifiers would otherwise leak into the UI.
 *
 * These are DISPLAY transforms only. The underlying data shape
 * (integration_events.event_type, audit_log.action, etc.) is unchanged.
 */

// ── Core token helper ──────────────────────────────────────────────────────

/**
 * Turn a snake_case / kebab-case token into Title Case words.
 *  - "phi_access"          → "Phi Access"
 *  - "ere-orchestrator"    → "Ere Orchestrator"
 *  - "document_uploaded"   → "Document Uploaded"
 */
export function humanizeToken(raw: string): string {
  if (!raw) return "";
  return raw
    .split(/[_\-.\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ── Audit-log action labels ────────────────────────────────────────────────

/**
 * Known audit-log actions get bespoke copy so acronyms (PHI) and verb tense
 * render correctly for human readers. Everything else falls back to
 * `humanizeToken`.
 */
const ACTION_LABELS: Record<string, string> = {
  // PHI / security
  phi_access: "PHI access",
  viewed_phi: "PHI viewed",
  "phi_create.document_processed": "PHI document processed",
  // Cases
  case_created: "Case created",
  case_updated: "Case updated",
  case_closed: "Case closed",
  stage_changed: "Stage changed",
  stage_advanced: "Stage advanced",
  status_changed: "Status changed",
  assignment_changed: "Assignment changed",
  field_updated: "Field updated",
  note_added: "Note added",
  // Documents
  document_uploaded: "Document uploaded",
  document_shared: "Document shared",
  document_downloaded: "Document downloaded",
  document_viewed: "Document viewed",
  uploaded: "Uploaded",
  downloaded: "Downloaded",
  viewed: "Viewed",
  // Users / auth
  user_invited: "User invited",
  user_deactivated: "User deactivated",
  login: "Sign-in",
  logout: "Sign-out",
  // Config
  config_changed: "Config changed",
  settings_updated: "Settings updated",
  // Tasks
  task_created: "Task created",
  task_completed: "Task completed",
  // Contacts / comms
  contact_added: "Contact added",
  message_received: "Message received",
  // Generic CRUD
  create: "Created",
  created: "Created",
  update: "Updated",
  updated: "Updated",
  assign: "Assigned",
  assigned: "Assigned",
  completed: "Completed",
  sent: "Sent",
  scheduled: "Scheduled",
  converted: "Converted",
  used: "Used",
  scored: "Scored",
  // Portal / intake
  portal_magic_link_issued: "Portal link issued",
  portal_magic_link_consumed: "Portal link used",
  portal_sms_suppressed_opt_out: "Portal SMS suppressed (opt-out)",
  // AI
  ai_draft_created: "AI draft created",
  ai_draft_error: "AI draft error",
};

export function humanizeAction(rawAction: string): string {
  if (!rawAction) return "";
  const key = rawAction.toLowerCase();
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  return humanizeToken(rawAction);
}

// ── Entity-type labels ─────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  case: "Case",
  contact: "Contact",
  lead: "Lead",
  task: "Task",
  document: "Document",
  user: "User",
  settings: "Settings",
  system: "System",
  communication: "Communication",
  hearing: "Hearing",
  rfc_request: "RFC request",
};

export function humanizeEntityType(rawType: string): string {
  if (!rawType) return "";
  const key = rawType.toLowerCase();
  if (ENTITY_TYPE_LABELS[key]) return ENTITY_TYPE_LABELS[key];
  return humanizeToken(rawType);
}

// ── Service / integration labels ───────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  "ere-orchestrator": "ERE Orchestrator",
  "ere-browser": "ERE Browser",
  "ere-cron": "ERE Cron",
  chronicle: "Chronicle",
  "case-status": "CaseStatus",
  mycase: "MyCase",
  outlook: "Outlook",
  resend: "Resend",
  twilio: "Twilio",
  calltools: "CallTools",
  langextract: "LangExtract",
  deepgram: "Deepgram",
  anthropic: "Claude",
  "railway-postgres": "Postgres",
  "railway-redis": "Redis",
  "railway-bucket": "Storage",
  n8n: "n8n",
  vercel: "Vercel",
  clerk: "Clerk",
};

export function humanizeService(rawService: string): string {
  if (!rawService) return "";
  const key = rawService.toLowerCase();
  if (SERVICE_LABELS[key]) return SERVICE_LABELS[key];
  return humanizeToken(rawService);
}

// ── Service category (for ticker pills) ────────────────────────────────────

export type ServiceCategory =
  | "Integrations"
  | "Email"
  | "SMS"
  | "Phone"
  | "AI"
  | "Infrastructure"
  | "Auth"
  | "Automation";

const SERVICE_CATEGORY: Record<string, ServiceCategory> = {
  "ere-orchestrator": "Integrations",
  "ere-browser": "Integrations",
  "ere-cron": "Integrations",
  chronicle: "Integrations",
  "case-status": "Integrations",
  mycase: "Integrations",
  outlook: "Email",
  resend: "Email",
  twilio: "SMS",
  calltools: "Phone",
  langextract: "AI",
  deepgram: "AI",
  anthropic: "AI",
  "railway-postgres": "Infrastructure",
  "railway-redis": "Infrastructure",
  "railway-bucket": "Infrastructure",
  vercel: "Infrastructure",
  clerk: "Auth",
  n8n: "Automation",
};

export function categoryForService(rawService: string): ServiceCategory {
  if (!rawService) return "Integrations";
  return SERVICE_CATEGORY[rawService.toLowerCase()] ?? "Integrations";
}

// ── Integration-event labels ───────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  config_changed: "Config changed",
  health_check: "Health check",
  webhook_received: "Webhook received",
  login: "Sign-in",
  portal_activated: "Portal activated",
  portal_magic_link_followed: "Portal link followed",
  upload_document: "Document uploaded",
  submit_treatment_log: "Treatment log submitted",
  stagnant_case: "Stagnant case",
  hearing_scheduled: "Hearing scheduled",
  appeal_deadline_approaching: "Appeal deadline approaching",
  favorable_decision: "Favorable decision",
  unfavorable_decision: "Unfavorable decision",
  denial_received: "Denial received",
  new_medical_evidence: "New medical evidence",
};

export function humanizeEventType(rawEventType: string): string {
  if (!rawEventType) return "";
  const key = rawEventType.toLowerCase();
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
  return humanizeToken(rawEventType);
}

// ── Case-ID fallback ───────────────────────────────────────────────────────

/**
 * Generate a short, legible placeholder when a case number can't be resolved.
 *  "5f802582-9982-4a9d-9170-a15a0c57..." → "Case #5f802582"
 */
export function fallbackCaseLabel(uuid: string): string {
  if (!uuid) return "Case";
  return `Case #${uuid.slice(0, 8)}`;
}
