import type { Metadata } from "next";
import { getFieldDefinitions } from "@/app/actions/custom-fields";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { TextField } from "@hugeicons/core-free-icons";
import { NewFieldDialog } from "./new-field-dialog";

export const metadata: Metadata = {
	title: "Custom Fields",
};

const TEAM_LABELS: Record<string, string> = {
	intake: "Intake",
	filing: "Filing",
	medical_records: "Medical Records",
	mail_sorting: "Mail Sorting",
	case_management: "Case Management",
	hearings: "Hearings",
	administration: "Administration",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
	text: "Text",
	textarea: "Long Text",
	number: "Number",
	date: "Date",
	boolean: "Yes/No",
	select: "Dropdown",
	multi_select: "Multi-Select",
	phone: "Phone",
	email: "Email",
	url: "URL",
	ssn: "SSN",
	currency: "Currency",
	calculated: "Calculated",
};

export default async function FieldsPage() {
	let allFields: Awaited<ReturnType<typeof getFieldDefinitions>> = [];

	try {
		allFields = await getFieldDefinitions();
	} catch {
		// DB unavailable
	}

	// Group by team
	const grouped = new Map<string, typeof allFields>();
	const globalFields: typeof allFields = [];

	for (const f of allFields) {
		if (!f.team) {
			globalFields.push(f);
		} else {
			if (!grouped.has(f.team)) grouped.set(f.team, []);
			grouped.get(f.team)!.push(f);
		}
	}

	const teams = [...grouped.keys()];

	return (
		<div className="space-y-6">
			<PageHeader
				title="Custom Fields"
				description="Define and organize custom fields by team."
				actions={<NewFieldDialog />}
			/>

			{allFields.length === 0 ? (
				<EmptyState
					icon={TextField}
					title="No custom fields"
					description="Create custom fields to track team-specific case data."
				/>
			) : (
				<Tabs defaultValue={teams[0] ?? "global"}>
					<TabsList className="flex-wrap h-auto">
						{globalFields.length > 0 && (
							<TabsTrigger value="global">
								Global ({globalFields.length})
							</TabsTrigger>
						)}
						{teams.map((team) => (
							<TabsTrigger key={team} value={team}>
								{TEAM_LABELS[team] ?? team} (
								{grouped.get(team)?.length ?? 0})
							</TabsTrigger>
						))}
					</TabsList>

					{globalFields.length > 0 && (
						<TabsContent value="global">
							<FieldsList fields={globalFields} />
						</TabsContent>
					)}

					{teams.map((team) => (
						<TabsContent key={team} value={team}>
							<FieldsList fields={grouped.get(team) ?? []} />
						</TabsContent>
					))}
				</Tabs>
			)}
		</div>
	);
}

function FieldsList({
	fields,
}: {
	fields: {
		id: string;
		name: string;
		slug: string;
		fieldType: string;
		section: string | null;
		isRequired: boolean;
		helpText: string | null;
	}[];
}) {
	// Group by section
	const sections = new Map<string, typeof fields>();
	for (const f of fields) {
		const sec = f.section ?? "General";
		if (!sections.has(sec)) sections.set(sec, []);
		sections.get(sec)!.push(f);
	}

	return (
		<div className="space-y-4 mt-4">
			{Array.from(sections.entries()).map(([section, sectionFields]) => (
				<Card key={section}>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm text-foreground">
							{section}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{sectionFields.map((field) => (
								<div
									key={field.id}
									className="flex items-center justify-between rounded-md border p-3"
								>
									<div className="flex items-center gap-3">
										<span className="text-sm font-medium text-foreground">
											{field.name}
										</span>
										<code className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
											{field.slug}
										</code>
										{field.isRequired && (
											<Badge
												variant="outline"
												className="text-xs text-red-600 border-red-300"
											>
												Required
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2">
										<Badge variant="secondary" className="text-xs">
											{FIELD_TYPE_LABELS[field.fieldType] ??
												field.fieldType}
										</Badge>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs"
										>
											Edit
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
