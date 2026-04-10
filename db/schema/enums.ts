import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "viewer",
]);

export const teamEnum = pgEnum("team", [
  "intake",
  "filing",
  "medical_records",
  "mail_sorting",
  "case_management",
  "hearings",
  "administration",
]);

// Lead pipeline statuses — expanded to mirror MyCase intake workflow.
// Grouped by category for the kanban view. Keep categorization in sync with
// `getLeadStatusCategory` in `app/actions/leads.ts` and the
// `LEAD_STATUS_CATEGORIES` config in `app/(app)/leads/page.tsx`.
export const leadStatusEnum = pgEnum("lead_status", [
  // Initial contact
  "new",
  "received_inquiry",
  "voicemail_left",
  "email_sent",
  "text_sent",
  "contacted",
  // Qualifying
  "qualifying",
  "interested",
  "not_interested",
  "wrong_number",
  "do_not_contact",
  "language_barrier",
  // Intake scheduling
  "intake_scheduled",
  "intake_no_show",
  "intake_rescheduled",
  "intake_in_progress",
  "intake_complete",
  // Conflict check
  "conflict_pending",
  "conflict_cleared",
  "conflict_blocked",
  // Contract
  "contract_drafting",
  "contract_sent",
  "contract_followup",
  "contract_signed",
  "contract_declined",
  // Conversion
  "converted",
  "converted_full_rep",
  "converted_consult_only",
  // Decline reasons
  "declined",
  "declined_age",
  "declined_capacity",
  "declined_outside_state",
  "declined_already_repd",
  "declined_other",
  // Other
  "unresponsive",
  "disqualified",
  "referred_out",
  "on_hold",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "active",
  "on_hold",
  "closed_won",
  "closed_lost",
  "closed_withdrawn",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const documentSourceEnum = pgEnum("document_source", [
  "upload",
  "template",
  "chronicle",
  "case_status",
  "email",
  "esignature",
  "ere",
]);

export const signatureStatusEnum = pgEnum("signature_status", [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
]);

export const communicationTypeEnum = pgEnum("communication_type", [
  "email_inbound",
  "email_outbound",
  "message_inbound",
  "message_outbound",
  "phone_inbound",
  "phone_outbound",
  "note",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "select",
  "multi_select",
  "phone",
  "email",
  "url",
  "ssn",
  "currency",
  "calculated",
]);

export const workflowTriggerTypeEnum = pgEnum("workflow_trigger_type", [
  "stage_enter",
  "stage_exit",
  "case_created",
  "field_changed",
  "document_received",
  "time_elapsed",
  "manual",
]);

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "hearing",
  "deadline",
  "appointment",
  "follow_up",
  "reminder",
]);

export const ereJobStatusEnum = pgEnum("ere_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const ereJobTypeEnum = pgEnum("ere_job_type", [
  "full_scrape",
  "incremental_sync",
  "document_download",
  "status_check",
]);

export const documentProcessingStatusEnum = pgEnum(
  "document_processing_status",
  ["pending", "extracting", "classifying", "completed", "failed"],
);

export const medicalEntryTypeEnum = pgEnum("medical_entry_type", [
  "office_visit",
  "hospitalization",
  "emergency",
  "lab_result",
  "imaging",
  "mental_health",
  "physical_therapy",
  "surgery",
  "prescription",
  "diagnosis",
  "functional_assessment",
  "other",
]);

export const exhibitPacketStatusEnum = pgEnum("exhibit_packet_status", [
  "draft",
  "building",
  "ready",
  "submitted",
  "failed",
]);
