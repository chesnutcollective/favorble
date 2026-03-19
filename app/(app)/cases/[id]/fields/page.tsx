import { getCaseFieldValues } from "@/app/actions/custom-fields";
import { requireSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TEAM_LABELS: Record<string, string> = {
	intake: "Intake",
	filing: "Filing",
	medical_records: "Medical Records",
	mail_sorting: "Mail Sorting",
	case_management: "Case Management",
	hearings: "Hearings",
	administration: "Administration",
};

export default async function CaseFieldsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;
	const user = await requireSession();

	// Get all field values (no team filter — show all teams with tabs)
	const fieldValues = await getCaseFieldValues(caseId);

	// Group by team
	const grouped = new Map<string, typeof fieldValues>();
	const globalFields: typeof fieldValues = [];

	for (const fv of fieldValues) {
		const team = fv.definition.team;
		if (!team) {
			globalFields.push(fv);
		} else {
			if (!grouped.has(team)) grouped.set(team, []);
			grouped.get(team)!.push(fv);
		}
	}

	// Put user's team first
	const teamOrder = [...grouped.keys()].sort((a, b) => {
		if (a === user.team) return -1;
		if (b === user.team) return 1;
		return 0;
	});

	const defaultTab = user.team && grouped.has(user.team) ? user.team : (teamOrder[0] ?? "global");

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Custom Fields</CardTitle>
			</CardHeader>
			<CardContent>
				{fieldValues.length === 0 ? (
					<p className="text-sm text-gray-500 py-4 text-center">
						No custom fields configured.
					</p>
				) : (
					<Tabs defaultValue={defaultTab}>
						<TabsList className="flex-wrap h-auto">
							{globalFields.length > 0 && (
								<TabsTrigger value="global">Global</TabsTrigger>
							)}
							{teamOrder.map((team) => (
								<TabsTrigger key={team} value={team}>
									{TEAM_LABELS[team] ?? team}
									{team === user.team && " (You)"}
								</TabsTrigger>
							))}
						</TabsList>

						{globalFields.length > 0 && (
							<TabsContent value="global">
								<FieldGrid fields={globalFields} />
							</TabsContent>
						)}

						{teamOrder.map((team) => (
							<TabsContent key={team} value={team}>
								<FieldGrid fields={grouped.get(team) ?? []} />
							</TabsContent>
						))}
					</Tabs>
				)}
			</CardContent>
		</Card>
	);
}

function FieldGrid({
	fields,
}: {
	fields: {
		definition: {
			id: string;
			name: string;
			fieldType: string;
			section: string | null;
			helpText: string | null;
		};
		value: {
			textValue: string | null;
			numberValue: number | null;
			dateValue: Date | null;
			booleanValue: boolean | null;
		} | null;
	}[];
}) {
	// Group by section
	const sections = new Map<string, typeof fields>();
	for (const f of fields) {
		const sec = f.definition.section ?? "General";
		if (!sections.has(sec)) sections.set(sec, []);
		sections.get(sec)!.push(f);
	}

	return (
		<div className="space-y-6 mt-4">
			{Array.from(sections.entries()).map(([section, sectionFields]) => (
				<div key={section}>
					<h4 className="text-sm font-medium text-gray-700 mb-3">
						{section}
					</h4>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{sectionFields.map((f) => {
							const displayValue = getDisplayValue(f);
							return (
								<div key={f.definition.id}>
									<p className="text-xs font-medium text-gray-500">
										{f.definition.name}
									</p>
									<p className="mt-0.5 text-sm text-gray-900">
										{displayValue || "—"}
									</p>
									{f.definition.helpText && (
										<p className="mt-0.5 text-xs text-gray-400">
											{f.definition.helpText}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

function getDisplayValue(field: {
	definition: { fieldType: string };
	value: {
		textValue: string | null;
		numberValue: number | null;
		dateValue: Date | null;
		booleanValue: boolean | null;
	} | null;
}): string {
	if (!field.value) return "";
	const v = field.value;
	switch (field.definition.fieldType) {
		case "boolean":
			return v.booleanValue === true ? "Yes" : v.booleanValue === false ? "No" : "";
		case "date":
			return v.dateValue ? new Date(v.dateValue).toLocaleDateString() : "";
		case "number":
		case "currency":
			return v.numberValue != null ? String(v.numberValue) : "";
		default:
			return v.textValue ?? "";
	}
}
