"use server";

import { db } from "@/db/drizzle";
import { customFieldDefinitions, customFieldValues } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, asc, inArray } from "drizzle-orm";
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

  const valueMap = new Map(values.map((v) => [v.fieldDefinitionId, v]));

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

  if (fieldValues.length === 0) {
    revalidatePath(`/cases/${caseId}`);
    return;
  }

  // Batch fetch all existing rows for these field definitions in one query,
  // then build a Map for O(1) lookup instead of per-row SELECTs.
  const definitionIds = fieldValues.map((fv) => fv.fieldDefinitionId);
  const existingRows = await db
    .select({
      id: customFieldValues.id,
      fieldDefinitionId: customFieldValues.fieldDefinitionId,
    })
    .from(customFieldValues)
    .where(
      and(
        eq(customFieldValues.caseId, caseId),
        inArray(customFieldValues.fieldDefinitionId, definitionIds),
      ),
    );

  const existingByDefId = new Map(
    existingRows.map((row) => [row.fieldDefinitionId, row.id]),
  );

  for (const fv of fieldValues) {
    const valueData = {
      textValue: fv.textValue ?? null,
      numberValue: fv.numberValue ?? null,
      dateValue: fv.dateValue ? new Date(fv.dateValue) : null,
      booleanValue: fv.booleanValue ?? null,
      jsonValue: fv.jsonValue ?? null,
      updatedAt: new Date(),
      updatedBy: session.id,
    };

    const existingId = existingByDefId.get(fv.fieldDefinitionId);
    if (existingId) {
      await db
        .update(customFieldValues)
        .set(valueData)
        .where(eq(customFieldValues.id, existingId));
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
  formula?: string;
}) {
  const session = await requireSession();

  // Extract formula dependencies if it's a calculated field
  let formulaDependencies: string[] | undefined;
  if (data.fieldType === "calculated" && data.formula) {
    const depRegex = /\{([^}]+)\}/g;
    const deps: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = depRegex.exec(data.formula)) !== null) {
      const slug = match[1].trim();
      if (!deps.includes(slug)) deps.push(slug);
    }
    formulaDependencies = deps;
  }

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
      formula: data.formula ?? null,
      formulaDependencies: formulaDependencies ?? null,
    })
    .returning();

  revalidatePath("/admin/fields");
  return field;
}

/**
 * Reorder a set of custom field definitions by updating their displayOrder.
 * Accepts an ordered list of field IDs (index = new displayOrder).
 * All fields must belong to the caller's organization.
 */
export async function reorderFields(orderedIds: string[]) {
  const session = await requireSession();

  if (orderedIds.length === 0) {
    revalidatePath("/admin/fields");
    return;
  }

  // Verify ownership: only update rows in this organization.
  const existing = await db
    .select({ id: customFieldDefinitions.id })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.organizationId, session.organizationId),
        inArray(customFieldDefinitions.id, orderedIds),
      ),
    );
  const ownedIds = new Set(existing.map((r) => r.id));

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (!ownedIds.has(id)) continue;
    await db
      .update(customFieldDefinitions)
      .set({ displayOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(customFieldDefinitions.id, id),
          eq(customFieldDefinitions.organizationId, session.organizationId),
        ),
      );
  }

  revalidatePath("/admin/fields");
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
