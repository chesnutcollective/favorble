"use server";

import { db } from "@/db/drizzle";
import { customFieldDefinitions, customFieldValues } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Get field definitions, optionally filtered by team.
 */
export async function getFieldDefinitions(team?: string) {
	const session = await requireSession();
	const conditions = [
		eq(customFieldDefinitions.organizationId, session.organizationId),
		eq(customFieldDefinitions.isActive, true),
	];

	if (team) {
		conditions.push(
			eq(
				customFieldDefinitions.team,
				team as
					| "intake"
					| "filing"
					| "medical_records"
					| "mail_sorting"
					| "case_management"
					| "hearings"
					| "administration",
			),
		);
	}

	return db
		.select()
		.from(customFieldDefinitions)
		.where(and(...conditions))
		.orderBy(
			asc(customFieldDefinitions.team),
			asc(customFieldDefinitions.section),
			asc(customFieldDefinitions.displayOrder),
		);
}

/**
 * Get field values for a case, optionally filtered by team.
 */
export async function getCaseFieldValues(caseId: string, team?: string) {
	await requireSession();

	// Get definitions
	const definitions = await getFieldDefinitions(team);

	// Get values
	const values = await db
		.select()
		.from(customFieldValues)
		.where(eq(customFieldValues.caseId, caseId));

	const valueMap = new Map(
		values.map((v) => [v.fieldDefinitionId, v]),
	);

	return definitions.map((def) => ({
		definition: def,
		value: valueMap.get(def.id) ?? null,
	}));
}

/**
 * Update field values for a case.
 */
export async function updateCaseFieldValues(
	caseId: string,
	fieldValues: {
		fieldDefinitionId: string;
		textValue?: string | null;
		numberValue?: number | null;
		dateValue?: string | null;
		booleanValue?: boolean | null;
		jsonValue?: unknown;
	}[],
) {
	const session = await requireSession();

	for (const fv of fieldValues) {
		const existing = await db
			.select({ id: customFieldValues.id })
			.from(customFieldValues)
			.where(
				and(
					eq(customFieldValues.caseId, caseId),
					eq(customFieldValues.fieldDefinitionId, fv.fieldDefinitionId),
				),
			)
			.limit(1);

		const valueData = {
			textValue: fv.textValue ?? null,
			numberValue: fv.numberValue ?? null,
			dateValue: fv.dateValue ? new Date(fv.dateValue) : null,
			booleanValue: fv.booleanValue ?? null,
			jsonValue: fv.jsonValue ?? null,
			updatedAt: new Date(),
			updatedBy: session.id,
		};

		if (existing.length > 0) {
			await db
				.update(customFieldValues)
				.set(valueData)
				.where(eq(customFieldValues.id, existing[0].id));
		} else {
			await db.insert(customFieldValues).values({
				caseId,
				fieldDefinitionId: fv.fieldDefinitionId,
				...valueData,
			});
		}
	}

	revalidatePath(`/cases/${caseId}`);
}

/**
 * Create a custom field definition.
 */
export async function createFieldDefinition(data: {
	name: string;
	slug: string;
	fieldType: string;
	team?: string;
	section?: string;
	placeholder?: string;
	helpText?: string;
	isRequired?: boolean;
	options?: unknown[];
}) {
	const session = await requireSession();

	const [field] = await db
		.insert(customFieldDefinitions)
		.values({
			organizationId: session.organizationId,
			name: data.name,
			slug: data.slug,
			fieldType: data.fieldType as
				| "text"
				| "textarea"
				| "number"
				| "date"
				| "boolean"
				| "select"
				| "multi_select"
				| "phone"
				| "email"
				| "url"
				| "ssn"
				| "currency"
				| "calculated",
			team: data.team as
				| "intake"
				| "filing"
				| "medical_records"
				| "mail_sorting"
				| "case_management"
				| "hearings"
				| "administration"
				| null,
			section: data.section,
			placeholder: data.placeholder,
			helpText: data.helpText,
			isRequired: data.isRequired ?? false,
			options: data.options ?? [],
		})
		.returning();

	revalidatePath("/admin/fields");
	return field;
}

/**
 * Update a custom field definition.
 */
export async function updateFieldDefinition(
	id: string,
	data: {
		name?: string;
		description?: string;
		section?: string;
		placeholder?: string;
		helpText?: string;
		isRequired?: boolean;
		options?: unknown[];
		isActive?: boolean;
	},
) {
	const updateData: Record<string, unknown> = { updatedAt: new Date() };
	if (data.name !== undefined) updateData.name = data.name;
	if (data.description !== undefined) updateData.description = data.description;
	if (data.section !== undefined) updateData.section = data.section;
	if (data.placeholder !== undefined) updateData.placeholder = data.placeholder;
	if (data.helpText !== undefined) updateData.helpText = data.helpText;
	if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;
	if (data.options !== undefined) updateData.options = data.options;
	if (data.isActive !== undefined) updateData.isActive = data.isActive;

	await db
		.update(customFieldDefinitions)
		.set(updateData)
		.where(eq(customFieldDefinitions.id, id));
	revalidatePath("/admin/fields");
}
