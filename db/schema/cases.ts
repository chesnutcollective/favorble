import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	boolean,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { leads } from "./leads";
import { caseStatusEnum, teamEnum } from "./enums";

export const caseStageGroups = pgTable(
	"case_stage_groups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		name: text("name").notNull(),
		displayOrder: integer("display_order").notNull().default(0),
		color: text("color"),
		clientVisibleName: text("client_visible_name"),
		clientVisibleDescription: text("client_visible_description"),
		showToClient: boolean("show_to_client").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("idx_stage_groups_org").on(table.organizationId)],
);

export const caseStages = pgTable(
	"case_stages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		stageGroupId: uuid("stage_group_id")
			.notNull()
			.references(() => caseStageGroups.id),
		name: text("name").notNull(),
		code: text("code").notNull(),
		description: text("description"),
		color: text("color"),
		displayOrder: integer("display_order").notNull().default(0),
		owningTeam: teamEnum("owning_team"),
		isInitial: boolean("is_initial").notNull().default(false),
		isTerminal: boolean("is_terminal").notNull().default(false),
		allowedNextStageIds: uuid("allowed_next_stage_ids").array(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_stages_org").on(table.organizationId),
		index("idx_stages_group").on(table.stageGroupId),
		uniqueIndex("idx_stages_org_code").on(table.organizationId, table.code),
	],
);

export const cases = pgTable(
	"cases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		caseNumber: text("case_number").notNull(),
		leadId: uuid("lead_id").references(() => leads.id),
		status: caseStatusEnum("status").notNull().default("active"),
		currentStageId: uuid("current_stage_id")
			.notNull()
			.references(() => caseStages.id),
		stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true })
			.defaultNow()
			.notNull(),

		// SSA-specific first-class fields
		ssnEncrypted: text("ssn_encrypted"),
		dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
		ssaClaimNumber: text("ssa_claim_number"),
		ssaOffice: text("ssa_office"),
		applicationTypePrimary: text("application_type_primary"),
		applicationTypeSecondary: text("application_type_secondary"),
		allegedOnsetDate: timestamp("alleged_onset_date", { withTimezone: true }),
		dateLastInsured: timestamp("date_last_insured", { withTimezone: true }),
		hearingOffice: text("hearing_office"),
		adminLawJudge: text("admin_law_judge"),

		// Chronicle integration
		chronicleClaimantId: text("chronicle_claimant_id"),
		chronicleUrl: text("chronicle_url"),
		chronicleLastSyncAt: timestamp("chronicle_last_sync_at", {
			withTimezone: true,
		}),

		// Case Status integration
		caseStatusExternalId: text("case_status_external_id"),

		closedAt: timestamp("closed_at", { withTimezone: true }),
		closedReason: text("closed_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdBy: uuid("created_by").references(() => users.id),
		updatedBy: uuid("updated_by").references(() => users.id),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_cases_org_status").on(table.organizationId, table.status),
		index("idx_cases_org_stage").on(table.organizationId, table.currentStageId),
		index("idx_cases_org_number").on(table.organizationId, table.caseNumber),
		index("idx_cases_chronicle").on(table.chronicleClaimantId),
		index("idx_cases_org_created").on(table.organizationId, table.createdAt),
		index("idx_cases_org_status_stage").on(
			table.organizationId,
			table.status,
			table.currentStageId,
		),
	],
);

export const caseAssignments = pgTable(
	"case_assignments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		role: text("role").notNull(),
		isPrimary: boolean("is_primary").notNull().default(false),
		assignedAt: timestamp("assigned_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_assignments_case").on(table.caseId),
		index("idx_assignments_user").on(table.userId),
		index("idx_assignments_user_active").on(
			table.userId,
			table.unassignedAt,
		),
		uniqueIndex("idx_assignments_case_user_role").on(
			table.caseId,
			table.userId,
			table.role,
		),
	],
);

export const caseStageTransitions = pgTable(
	"case_stage_transitions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id),
		fromStageId: uuid("from_stage_id").references(() => caseStages.id),
		toStageId: uuid("to_stage_id")
			.notNull()
			.references(() => caseStages.id),
		transitionedAt: timestamp("transitioned_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		transitionedBy: uuid("transitioned_by").references(() => users.id),
		notes: text("notes"),
		isAutomatic: boolean("is_automatic").notNull().default(false),
	},
	(table) => [
		index("idx_transitions_case").on(table.caseId),
		index("idx_transitions_date").on(table.transitionedAt),
	],
);
