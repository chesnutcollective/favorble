"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditFieldDialog, type FieldFormData } from "./new-field-dialog";

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

export function FieldRow({ field }: { field: FieldFormData }) {
	return (
		<div className="flex items-center justify-between rounded-md border p-3">
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
					{FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}
				</Badge>
				<EditFieldDialog field={field}>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
					>
						Edit
					</Button>
				</EditFieldDialog>
			</div>
		</div>
	);
}
