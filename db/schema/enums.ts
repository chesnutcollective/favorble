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

export const leadStatusEnum = pgEnum("lead_status", [
	"new",
	"contacted",
	"intake_scheduled",
	"intake_in_progress",
	"contract_sent",
	"contract_signed",
	"converted",
	"declined",
	"unresponsive",
	"disqualified",
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
