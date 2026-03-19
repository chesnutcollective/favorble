import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	boolean,
	jsonb,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { customFieldTypeEnum, teamEnum } from "./enums";

export const customFieldDefinitions = pgTable(
	"custom_field_definitions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		fieldType: customFieldTypeEnum("field_type").notNull(),
		team: teamEnum("team"), // null = global
		section: text("section"),
		displayOrder: integer("display_order").notNull().default(0),
		placeholder: text("placeholder"),
		helpText: text("help_text"),
		isRequired: boolean("is_required").notNull().default(false),
		validationRules: jsonb("validation_rules").default({}),
		options: jsonb("options").default([]),
		formula: text("formula"),
		formulaDependencies: text("formula_dependencies").array(),
		isActive: boolean("is_active").notNull().default(true),
		visibleToRoles: text("visible_to_roles").array(),
		editableByRoles: text("editable_by_roles").array(),
		showInIntakeForm: boolean("show_in_intake_form").notNull().default(false),
		intakeFormOrder: integer("intake_form_order"),
		intakeFormScript: text("intake_form_script"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("idx_cfd_org").on(table.organizationId),
		index("idx_cfd_org_team").on(table.organizationId, table.team),
		uniqueIndex("idx_cfd_org_slug").on(table.organizationId, table.slug),
	],
);

export const customFieldValues = pgTable(
	"custom_field_values",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id),
		fieldDefinitionId: uuid("field_definition_id")
			.notNull()
			.references(() => customFieldDefinitions.id),
		textValue: text("text_value"),
		numberValue: integer("number_value"),
		dateValue: timestamp("date_value", { withTimezone: true }),
		booleanValue: boolean("boolean_value"),
		jsonValue: jsonb("json_value"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedBy: uuid("updated_by"),
	},
	(table) => [
		index("idx_cfv_case").on(table.caseId),
		uniqueIndex("idx_cfv_case_field").on(
			table.caseId,
			table.fieldDefinitionId,
		),
		index("idx_cfv_field_text").on(table.fieldDefinitionId, table.textValue),
		index("idx_cfv_field_number").on(
			table.fieldDefinitionId,
			table.numberValue,
		),
		index("idx_cfv_field_date").on(table.fieldDefinitionId, table.dateValue),
	],
);
