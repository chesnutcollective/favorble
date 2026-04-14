import { getCaseFieldValues } from "@/app/actions/custom-fields";
import { getCaseById } from "@/app/actions/cases";
import { requireSession } from "@/lib/auth/session";
import { EditableFieldsForm } from "./editable-fields-form";
import { ReferralSourceField } from "./referral-source-field";

export default async function CaseFieldsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const user = await requireSession();

  // Get all field values (no team filter — show all teams with tabs)
  let fieldValues: Awaited<ReturnType<typeof getCaseFieldValues>> = [];
  let caseData: Awaited<ReturnType<typeof getCaseById>> = null;

  try {
    [fieldValues, caseData] = await Promise.all([
      getCaseFieldValues(caseId),
      getCaseById(caseId),
    ]);
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
    <div className="space-y-4">
      <ReferralSourceField
        caseId={caseId}
        initialSource={caseData?.referralSource ?? null}
        initialContactId={caseData?.referralContactId ?? null}
      />
      <EditableFieldsForm
        caseId={caseId}
        fieldValues={serializedFieldValues}
        userTeam={user.team ?? null}
      />
    </div>
  );
}
