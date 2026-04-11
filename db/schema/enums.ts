import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "phi_sheet_writer",
  "reviewer",
  "fee_collection",
  "hearing_advocate",
  "appeals_council",
  "post_hearing",
  "pre_hearing_prep",
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
  "pending_client_confirmation",
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
  "message_received",
  "time_elapsed",
  "event_detected",
  "manual",
]);

// Event types the supervisor event bus can observe. Feeds SA-1, SA-5, SA-8.
export const supervisorEventTypeEnum = pgEnum("supervisor_event_type", [
  "denial_received",
  "unfavorable_decision",
  "favorable_decision",
  "hearing_scheduled",
  "hearing_rescheduled",
  "appeal_deadline_approaching",
  "appeal_window_opened",
  "new_medical_evidence",
  "fee_awarded",
  "rfc_received",
  "mr_complete",
  "missed_task_deadline",
  "stagnant_case",
  "workload_imbalance",
  "ssa_status_change",
  "client_message_received",
  "client_sentiment_risk",
  "compliance_violation",
]);

export const supervisorEventStatusEnum = pgEnum("supervisor_event_status", [
  "detected",
  "file_updated",
  "draft_created",
  "task_assigned",
  "awaiting_review",
  "resolved",
  "dismissed",
]);

// Channels we can deliver a notification through.
export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "email",
  "sms",
  "push",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "info",
  "normal",
  "high",
  "urgent",
]);

// AI-generated draft artifact types — feeds SA-2, CM-4.
export const aiDraftTypeEnum = pgEnum("ai_draft_type", [
  "client_message",
  "client_letter",
  "call_script",
  "appeal_form",
  "reconsideration_request",
  "pre_hearing_brief",
  "appeals_council_brief",
  "medical_records_request",
  "fee_petition",
  "task_instructions",
  "status_update",
  "rfc_letter",
  "coaching_conversation",
  "other",
]);

export const aiDraftStatusEnum = pgEnum("ai_draft_status", [
  "generating",
  "draft_ready",
  "in_review",
  "approved",
  "sent",
  "rejected",
  "error",
]);

// Coaching workflow statuses — feeds CC-1 through CC-4.
export const coachingFlagStatusEnum = pgEnum("coaching_flag_status", [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
]);

// Compliance finding severities — feeds PR-2.
export const complianceFindingSeverityEnum = pgEnum(
  "compliance_finding_severity",
  ["info", "low", "medium", "high", "critical"],
);

export const complianceFindingStatusEnum = pgEnum(
  "compliance_finding_status",
  ["open", "acknowledged", "remediated", "false_positive"],
);

// Escalation state on tasks — feeds SA-7.
export const escalationStateEnum = pgEnum("escalation_state", [
  "none",
  "reminder_sent",
  "supervisor_notified",
  "management_flagged",
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

// ─────────────────────────────────────────────────────────────
// Tier 1 QA foundation enums (QA-1/2/3)
// Restored — these were part of the migrated Tier 1 foundation per
// the supervisor plan. Kept minimal; see db/schema/call-qc.ts,
// db/schema/communications.ts for consumers.
// ─────────────────────────────────────────────────────────────

export const callQcStatusEnum = pgEnum("call_qc_status", [
  "pending_transcription",
  "transcribed",
  "pending_review",
  "reviewed",
  "flagged",
  "error",
]);

export const messageQaStatusEnum = pgEnum("message_qa_status", [
  "pending",
  "passed",
  "needs_edit",
  "blocked",
  "error",
]);

export const sentimentLabelEnum = pgEnum("sentiment_label", [
  "positive",
  "neutral",
  "confused",
  "frustrated",
  "angry",
  "churn_risk",
]);
