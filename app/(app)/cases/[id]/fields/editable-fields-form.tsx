"use client";

import { useState, useTransition, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateCaseFieldValues } from "@/app/actions/custom-fields";
import { evaluateFormula, type FormulaContext } from "@/lib/formula-engine";
import { toast } from "sonner";

type FieldDefinition = {
  id: string;
  name: string;
  slug: string;
  fieldType: string;
  section: string | null;
  helpText: string | null;
  team: string | null;
  isRequired: boolean;
  placeholder: string | null;
  options: unknown;
  formula: string | null;
};

type FieldValue = {
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  booleanValue: boolean | null;
  jsonValue: unknown;
} | null;

type FieldEntry = {
  definition: FieldDefinition;
  value: FieldValue;
};

type FormValues = Record<
  string,
  {
    textValue?: string | null;
    numberValue?: number | null;
    dateValue?: string | null;
    booleanValue?: boolean | null;
    jsonValue?: unknown;
  }
>;

const TEAM_LABELS: Record<string, string> = {
  intake: "Intake",
  filing: "Filing",
  medical_records: "Medical Records",
  mail_sorting: "Mail Sorting",
  case_management: "Case Management",
  hearings: "Hearings",
  administration: "Administration",
};

function getInitialFormValues(fields: FieldEntry[]): FormValues {
  const values: FormValues = {};
  for (const f of fields) {
    values[f.definition.id] = {
      textValue: f.value?.textValue ?? null,
      numberValue: f.value?.numberValue ?? null,
      dateValue: f.value?.dateValue ?? null,
      booleanValue: f.value?.booleanValue ?? null,
      jsonValue: f.value?.jsonValue ?? null,
    };
  }
  return values;
}

function getFieldOptions(field: FieldDefinition): string[] {
  if (!field.options) return [];
  if (Array.isArray(field.options)) {
    return field.options.map((o) =>
      typeof o === "string"
        ? o
        : ((o as { label?: string; value?: string })?.value ?? String(o)),
    );
  }
  return [];
}

function getFieldOptionLabel(field: FieldDefinition, value: string): string {
  if (!field.options || !Array.isArray(field.options)) return value;
  for (const o of field.options) {
    if (typeof o === "string") {
      if (o === value) return o;
    } else {
      const opt = o as { label?: string; value?: string };
      if (opt.value === value) return opt.label ?? opt.value ?? value;
    }
  }
  return value;
}

/**
 * Build a formula context mapping field slugs to their current values.
 */
function buildFormulaContext(
  allFields: FieldEntry[],
  formValues: FormValues,
): FormulaContext {
  const ctx: FormulaContext = {};
  for (const f of allFields) {
    const val = formValues[f.definition.id];
    const slug = f.definition.slug;
    if (!val) continue;

    switch (f.definition.fieldType) {
      case "number":
      case "currency":
        ctx[slug] = val.numberValue ?? null;
        break;
      case "boolean":
        ctx[slug] = val.booleanValue ?? null;
        break;
      case "date":
        ctx[slug] = val.dateValue ?? null;
        break;
      default:
        ctx[slug] = val.textValue ?? null;
        break;
    }
  }
  return ctx;
}

export function EditableFieldsForm({
  caseId,
  fieldValues,
  userTeam,
}: {
  caseId: string;
  fieldValues: FieldEntry[];
  userTeam: string | null;
}) {
  const [formValues, setFormValues] = useState<FormValues>(() =>
    getInitialFormValues(fieldValues),
  );
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Build formula context for calculated fields, re-evaluated on every render
  const formulaContext = useMemo(
    () => buildFormulaContext(fieldValues, formValues),
    [fieldValues, formValues],
  );

  // Group by team
  const grouped = useMemo(() => {
    const map = new Map<string, FieldEntry[]>();
    const globalFields: FieldEntry[] = [];

    for (const fv of fieldValues) {
      const team = fv.definition.team;
      if (!team) {
        globalFields.push(fv);
      } else {
        if (!map.has(team)) map.set(team, []);
        map.get(team)!.push(fv);
      }
    }

    return { map, globalFields };
  }, [fieldValues]);

  const teamOrder = useMemo(() => {
    return [...grouped.map.keys()].sort((a, b) => {
      if (a === userTeam) return -1;
      if (b === userTeam) return 1;
      return 0;
    });
  }, [grouped.map, userTeam]);

  const defaultTab =
    userTeam && grouped.map.has(userTeam)
      ? userTeam
      : (teamOrder[0] ?? "global");

  function filterFields(fields: FieldEntry[]): FieldEntry[] {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter(
      (f) =>
        f.definition.name.toLowerCase().includes(q) ||
        (f.definition.section ?? "").toLowerCase().includes(q) ||
        f.definition.fieldType.toLowerCase().includes(q),
    );
  }

  function updateFieldValue(
    fieldId: string,
    update: Partial<FormValues[string]>,
  ) {
    setFormValues((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], ...update },
    }));
    // Clear validation error when user edits
    if (validationErrors[fieldId]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const fv of fieldValues) {
      if (fv.definition.isRequired) {
        const val = formValues[fv.definition.id];
        const isEmpty = isValueEmpty(fv.definition.fieldType, val);
        if (isEmpty) {
          errors[fv.definition.id] = `${fv.definition.name} is required`;
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function isValueEmpty(
    fieldType: string,
    val: FormValues[string] | undefined,
  ): boolean {
    if (!val) return true;
    switch (fieldType) {
      case "boolean":
        return val.booleanValue === null || val.booleanValue === undefined;
      case "number":
      case "currency":
        return val.numberValue === null || val.numberValue === undefined;
      case "date":
        return !val.dateValue;
      case "multi_select":
        return (
          !val.jsonValue ||
          (Array.isArray(val.jsonValue) && val.jsonValue.length === 0)
        );
      default:
        return !val.textValue || val.textValue.trim() === "";
    }
  }

  function handleSave() {
    if (!validate()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    startTransition(async () => {
      try {
        const updates = Object.entries(formValues).map(
          ([fieldDefinitionId, vals]) => ({
            fieldDefinitionId,
            textValue: vals.textValue,
            numberValue: vals.numberValue,
            dateValue: vals.dateValue,
            booleanValue: vals.booleanValue,
            jsonValue: vals.jsonValue,
          }),
        );
        await updateCaseFieldValues(caseId, updates);
        toast.success("Fields saved successfully.");
      } catch {
        toast.error("Failed to save fields. Please try again.");
      }
    });
  }

  if (fieldValues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom fields configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Custom Fields</CardTitle>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
        <div className="mt-2">
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex-wrap h-auto">
            {grouped.globalFields.length > 0 && (
              <TabsTrigger value="global">Global</TabsTrigger>
            )}
            {teamOrder.map((team) => (
              <TabsTrigger key={team} value={team}>
                {TEAM_LABELS[team] ?? team}
                {team === userTeam && " (You)"}
              </TabsTrigger>
            ))}
          </TabsList>

          {grouped.globalFields.length > 0 && (
            <TabsContent value="global">
              <EditableFieldGrid
                fields={filterFields(grouped.globalFields)}
                formValues={formValues}
                onUpdateField={updateFieldValue}
                validationErrors={validationErrors}
                formulaContext={formulaContext}
              />
            </TabsContent>
          )}

          {teamOrder.map((team) => (
            <TabsContent key={team} value={team}>
              <EditableFieldGrid
                fields={filterFields(grouped.map.get(team) ?? [])}
                formValues={formValues}
                onUpdateField={updateFieldValue}
                validationErrors={validationErrors}
                formulaContext={formulaContext}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EditableFieldGrid({
  fields,
  formValues,
  onUpdateField,
  validationErrors,
  formulaContext,
}: {
  fields: FieldEntry[];
  formValues: FormValues;
  onUpdateField: (fieldId: string, update: Partial<FormValues[string]>) => void;
  validationErrors: Record<string, string>;
  formulaContext: FormulaContext;
}) {
  // Group by section
  const sections = new Map<string, FieldEntry[]>();
  for (const f of fields) {
    const sec = f.definition.section ?? "General";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(f);
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No fields match your search.
      </p>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {Array.from(sections.entries()).map(([section, sectionFields]) => (
        <div key={section}>
          <h4 className="text-sm font-medium text-foreground mb-3">
            {section}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sectionFields.map((f) => (
              <FieldInput
                key={f.definition.id}
                field={f}
                value={formValues[f.definition.id]}
                onChange={(update) => onUpdateField(f.definition.id, update)}
                error={validationErrors[f.definition.id]}
                formulaContext={formulaContext}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  error,
  formulaContext,
}: {
  field: FieldEntry;
  value: FormValues[string] | undefined;
  onChange: (update: Partial<FormValues[string]>) => void;
  error?: string;
  formulaContext: FormulaContext;
}) {
  const def = field.definition;
  const options = getFieldOptions(def);

  const renderInput = () => {
    switch (def.fieldType) {
      case "text":
        return (
          <Input
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? undefined}
          />
        );

      case "textarea":
        return (
          <Textarea
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? undefined}
            rows={3}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value?.numberValue ?? ""}
            onChange={(e) =>
              onChange({
                numberValue: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder={def.placeholder ?? undefined}
          />
        );

      case "currency":
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              type="number"
              value={value?.numberValue ?? ""}
              onChange={(e) =>
                onChange({
                  numberValue: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder={def.placeholder ?? "0.00"}
              className="pl-7"
              step="0.01"
            />
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={value?.dateValue ? value.dateValue.split("T")[0] : ""}
            onChange={(e) =>
              onChange({
                dateValue: e.target.value || null,
              })
            }
          />
        );

      case "boolean":
        return (
          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={value?.booleanValue ?? false}
              onCheckedChange={(checked) => onChange({ booleanValue: checked })}
            />
            <span className="text-sm text-muted-foreground">
              {value?.booleanValue ? "Yes" : "No"}
            </span>
          </div>
        );

      case "select":
        return (
          <Select
            value={value?.textValue ?? ""}
            onValueChange={(v) => onChange({ textValue: v || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder={def.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {getFieldOptionLabel(def, opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multi_select": {
        const selectedValues = Array.isArray(value?.jsonValue)
          ? (value.jsonValue as string[])
          : [];
        return (
          <div className="space-y-2 pt-1">
            {options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, opt]
                      : selectedValues.filter((v) => v !== opt);
                    onChange({
                      jsonValue: newValues,
                    });
                  }}
                />
                <span className="text-sm">{getFieldOptionLabel(def, opt)}</span>
              </div>
            ))}
            {options.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No options configured.
              </p>
            )}
          </div>
        );
      }

      case "phone":
        return (
          <Input
            type="tel"
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? "(555) 555-5555"}
          />
        );

      case "email":
        return (
          <Input
            type="email"
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? "email@example.com"}
          />
        );

      case "url":
        return (
          <Input
            type="url"
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? "https://"}
          />
        );

      case "ssn":
        return (
          <Input
            type="password"
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? "XXX-XX-XXXX"}
            autoComplete="off"
          />
        );

      case "calculated": {
        const result = def.formula
          ? evaluateFormula(def.formula, formulaContext)
          : "No formula defined";
        return (
          <div className="flex items-center rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <span className="text-foreground font-medium">{result}</span>
            <span className="ml-auto text-xs text-muted-foreground">auto</span>
          </div>
        );
      }

      default:
        return (
          <Input
            value={value?.textValue ?? ""}
            onChange={(e) => onChange({ textValue: e.target.value || null })}
            placeholder={def.placeholder ?? undefined}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">
        {def.name}
        {def.isRequired && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {renderInput()}
      {def.helpText && (
        <p className="text-xs text-muted-foreground">{def.helpText}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
