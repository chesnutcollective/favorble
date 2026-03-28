"use client";

import { useState, useTransition } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { createFieldDefinition } from "@/app/actions/custom-fields";
import { toast } from "sonner";

const FIELD_TYPES = [
	{ value: "text", label: "Text" },
	{ value: "textarea", label: "Long Text" },
	{ value: "number", label: "Number" },
	{ value: "date", label: "Date" },
	{ value: "boolean", label: "Yes/No" },
	{ value: "select", label: "Dropdown" },
	{ value: "multi_select", label: "Multi-Select" },
	{ value: "phone", label: "Phone" },
	{ value: "email", label: "Email" },
	{ value: "url", label: "URL" },
	{ value: "ssn", label: "SSN" },
	{ value: "currency", label: "Currency" },
];

const TEAM_OPTIONS = [
	{ value: "intake", label: "Intake" },
	{ value: "filing", label: "Filing" },
	{ value: "medical_records", label: "Medical Records" },
	{ value: "mail_sorting", label: "Mail Sorting" },
	{ value: "case_management", label: "Case Management" },
	{ value: "hearings", label: "Hearings" },
	{ value: "administration", label: "Administration" },
];

export function NewFieldDialog() {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [fieldType, setFieldType] = useState("");
	const [team, setTeam] = useState("");
	const [section, setSection] = useState("");
	const [isRequired, setIsRequired] = useState(false);
	const [helpText, setHelpText] = useState("");

	function resetForm() {
		setName("");
		setSlug("");
		setFieldType("");
		setTeam("");
		setSection("");
		setIsRequired(false);
		setHelpText("");
	}

	function handleNameChange(val: string) {
		setName(val);
		const autoSlug = val
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, "")
			.replace(/\s+/g, "_")
			.slice(0, 50);
		setSlug(autoSlug);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!name.trim()) {
			toast.error("Name is required.");
			return;
		}
		if (!slug.trim()) {
			toast.error("Slug is required.");
			return;
		}
		if (!fieldType) {
			toast.error("Field type is required.");
			return;
		}

		startTransition(async () => {
			try {
				await createFieldDefinition({
					name: name.trim(),
					slug: slug.trim(),
					fieldType,
					team: team || undefined,
					section: section.trim() || undefined,
					isRequired,
					helpText: helpText.trim() || undefined,
				});
				toast.success("Field created.");
				resetForm();
				setOpen(false);
			} catch {
				toast.error("Failed to create field.");
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) resetForm();
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm">
					<HugeiconsIcon
						icon={PlusSignIcon}
						size={16}
						className="mr-1"
					/>
					New Field
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New Custom Field</DialogTitle>
						<DialogDescription>
							Define a new custom field for tracking case data.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="fd-name">
								Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id="fd-name"
								value={name}
								onChange={(e) =>
									handleNameChange(e.target.value)
								}
								placeholder="e.g. Date of Injury"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fd-slug">
								Slug <span className="text-red-500">*</span>
							</Label>
							<Input
								id="fd-slug"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								placeholder="e.g. date_of_injury"
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground">
								Auto-generated from name. Used as a unique identifier.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fd-type">
								Type <span className="text-red-500">*</span>
							</Label>
							<Select
								value={fieldType}
								onValueChange={setFieldType}
							>
								<SelectTrigger id="fd-type">
									<SelectValue placeholder="Select type..." />
								</SelectTrigger>
								<SelectContent>
									{FIELD_TYPES.map((ft) => (
										<SelectItem
											key={ft.value}
											value={ft.value}
										>
											{ft.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fd-team">Team</Label>
							<Select value={team} onValueChange={setTeam}>
								<SelectTrigger id="fd-team">
									<SelectValue placeholder="Global (all teams)" />
								</SelectTrigger>
								<SelectContent>
									{TEAM_OPTIONS.map((t) => (
										<SelectItem
											key={t.value}
											value={t.value}
										>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fd-section">Section</Label>
							<Input
								id="fd-section"
								value={section}
								onChange={(e) => setSection(e.target.value)}
								placeholder="e.g. Claimant Info"
							/>
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="fd-required">Required</Label>
							<Switch
								id="fd-required"
								checked={isRequired}
								onCheckedChange={setIsRequired}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fd-help">Help Text</Label>
							<Textarea
								id="fd-help"
								value={helpText}
								onChange={(e) => setHelpText(e.target.value)}
								placeholder="Instructions shown below the field"
								rows={2}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Creating..." : "Create Field"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
