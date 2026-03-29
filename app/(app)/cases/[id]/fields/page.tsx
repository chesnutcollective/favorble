import { getCaseFieldValues } from "@/app/actions/custom-fields";
import { requireSession } from "@/lib/auth/session";
import { EditableFieldsForm } from "./editable-fields-form";

export default async function CaseFieldsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const user = await requireSession();

  // Get all field values (no team filter — show all teams with tabs)
  let fieldValues: Awaited<ReturnType<typeof getCaseFieldValues>> = [];

  try {
    fieldValues = await getCaseFieldValues(caseId);
  } catch {
    // DB unavailable
  }

  // Serialize Date objects to ISO strings for the client component
  const serializedFieldValues = fieldValues.map((fv) => ({
    definition: {
      id: fv.definition.id,
      name: fv.definition.name,
      slug: fv.definition.slug,
      fieldType: fv.definition.fieldType,
      section: fv.definition.section,
      helpText: fv.definition.helpText,
      team: fv.definition.team,
      isRequired: fv.definition.isRequired,
      placeholder: fv.definition.placeholder,
      options: fv.definition.options,
      formula: fv.definition.formula,
    },
    value: fv.value
      ? {
          textValue: fv.value.textValue,
          numberValue: fv.value.numberValue,
          dateValue: fv.value.dateValue
            ? fv.value.dateValue.toISOString()
            : null,
          booleanValue: fv.value.booleanValue,
          jsonValue: fv.value.jsonValue,
        }
      : null,
  }));

  return (
    <EditableFieldsForm
      caseId={caseId}
      fieldValues={serializedFieldValues}
      userTeam={user.team ?? null}
    />
  );
}
