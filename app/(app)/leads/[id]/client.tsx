"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import {
	convertLeadToCase,
	updateLeadStatus,
	saveIntakeData,
	sendLeadContract,
} from "@/app/actions/leads";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowRight01Icon,
	Mail01Icon,
	Call02Icon,
	ArrowLeft01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";

type LeadDetail = {
	id: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	status: string;
	source: string | null;
	notes: string | null;
	assignedToId: string | null;
	convertedToCaseId: string | null;
	convertedAt: string | null;
	intakeData: Record<string, unknown> | null;
	lastContactedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

type Stage = {
	id: string;
	name: string;
	code: string;
	stageGroupId: string;
	owningTeam: string | null;
	isInitial: boolean;
	isTerminal: boolean;
};

type IntakeField = {
	id: string;
	name: string;
	slug: string;
	fieldType: string;
	isRequired: boolean;
	placeholder: string | null;
	helpText: string | null;
	options: { label: string; value: string }[] | null;
	intakeFormScript: string | null;
};

type SignatureRequest = {
	id: string;
	signerEmail: string;
	signerName: string;
	contractType: string | null;
	status: string;
	sentAt: string | null;
	signedAt: string | null;
	createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
	new: "New",
	contacted: "Contacted",
	intake_scheduled: "Intake Scheduled",
	intake_in_progress: "Intake in Progress",
	contract_sent: "Contract Sent",
	contract_signed: "Contract Signed",
	converted: "Converted",
	declined: "Declined",
	unresponsive: "Unresponsive",
	disqualified: "Disqualified",
};

const STATUS_COLORS: Record<string, string> = {
	new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
	contacted: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300",
	intake_scheduled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
	intake_in_progress: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
	contract_sent: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
	contract_signed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
	converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
	declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
	unresponsive: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
	disqualified: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

const SIG_STATUS_COLORS: Record<string, string> = {
	pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
	viewed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
	signed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
	declined: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
	expired: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function LeadDetailClient({
	lead,
	stages,
	intakeFields,
	signatureRequests: initialSignatureRequests,
}: {
	lead: LeadDetail;
	stages: Stage[];
	intakeFields: IntakeField[];
	signatureRequests: SignatureRequest[];
}) {
	const router = useRouter();
	const [convertOpen, setConvertOpen] = useState(false);
	const [convertStageId, setConvertStageId] = useState("");
	const [isPending, startTransition] = useTransition();

	// Intake form state
	const [intakeValues, setIntakeValues] = useState<Record<string, unknown>>(() => {
		// Initialize from existing intakeData
		const existing = lead.intakeData ?? {};
		const initial: Record<string, unknown> = {};
		for (const field of intakeFields) {
			initial[field.slug] = existing[field.slug] ?? "";
		}
		return initial;
	});
	const [intakeSaved, setIntakeSaved] = useState(false);

	// eSignature state
	const [contractOpen, setContractOpen] = useState(false);
	const [signerEmail, setSignerEmail] = useState(lead.email ?? "");
	const [signerName, setSignerName] = useState(`${lead.firstName} ${lead.lastName}`);
	const [signatureRequests, setSignatureRequests] = useState(initialSignatureRequests);

	const isConverted = lead.status === "converted";
	const isClosed =
		lead.status === "declined" ||
		lead.status === "unresponsive" ||
		lead.status === "disqualified";

	const initialStages = stages.filter((s) => s.isInitial);

	function handleConvert() {
		if (!convertStageId) return;
		startTransition(async () => {
			const newCase = await convertLeadToCase(lead.id, {
				initialStageId: convertStageId,
			});
			router.push(`/cases/${newCase.id}`);
		});
	}

	function handleAdvanceStatus() {
		const pipeline = [
			"new",
			"contacted",
			"intake_in_progress",
			"contract_sent",
			"contract_signed",
		];
		const idx = pipeline.indexOf(lead.status);
		if (idx >= 0 && idx < pipeline.length - 1) {
			const nextStatus = pipeline[idx + 1];
			startTransition(async () => {
				await updateLeadStatus(lead.id, nextStatus);
				router.refresh();
			});
		}
	}

	function handleIntakeFieldChange(slug: string, value: unknown) {
		setIntakeSaved(false);
		setIntakeValues((prev) => ({ ...prev, [slug]: value }));
	}

	function handleSaveIntake() {
		startTransition(async () => {
			await saveIntakeData(lead.id, intakeValues);
			setIntakeSaved(true);
			router.refresh();
		});
	}

	function handleSendContract() {
		if (!signerEmail || !signerName) return;
		startTransition(async () => {
			const sigReq = await sendLeadContract(lead.id, {
				signerEmail,
				signerName,
			});
			setSignatureRequests((prev) => [
				{
					id: sigReq.id,
					signerEmail: sigReq.signerEmail,
					signerName: sigReq.signerName,
					contractType: sigReq.contractType,
					status: sigReq.status,
					sentAt: sigReq.sentAt?.toISOString() ?? null,
					signedAt: sigReq.signedAt?.toISOString() ?? null,
					createdAt: sigReq.createdAt.toISOString(),
				},
				...prev,
			]);
			setContractOpen(false);
			router.refresh();
		});
	}

	function renderIntakeField(field: IntakeField) {
		const value = intakeValues[field.slug];

		switch (field.fieldType) {
			case "textarea":
				return (
					<Textarea
						value={String(value ?? "")}
						onChange={(e) => handleIntakeFieldChange(field.slug, e.target.value)}
						placeholder={field.placeholder ?? ""}
						rows={3}
					/>
				);
			case "number":
			case "currency":
				return (
					<Input
						type="number"
						value={String(value ?? "")}
						onChange={(e) => handleIntakeFieldChange(field.slug, e.target.value ? Number(e.target.value) : "")}
						placeholder={field.placeholder ?? ""}
					/>
				);
			case "date":
				return (
					<Input
						type="date"
						value={String(value ?? "")}
						onChange={(e) => handleIntakeFieldChange(field.slug, e.target.value)}
					/>
				);
			case "boolean":
				return (
					<div className="flex items-center gap-2">
						<Checkbox
							checked={Boolean(value)}
							onCheckedChange={(checked) => handleIntakeFieldChange(field.slug, checked)}
						/>
						<span className="text-sm">{field.name}</span>
					</div>
				);
			case "select":
				return (
					<Select
						value={String(value ?? "")}
						onValueChange={(v) => handleIntakeFieldChange(field.slug, v)}
					>
						<SelectTrigger>
							<SelectValue placeholder={field.placeholder ?? "Select..."} />
						</SelectTrigger>
						<SelectContent>
							{(field.options ?? []).map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			default:
				// text, phone, email, url, ssn
				return (
					<Input
						type={field.fieldType === "email" ? "email" : field.fieldType === "phone" ? "tel" : "text"}
						value={String(value ?? "")}
						onChange={(e) => handleIntakeFieldChange(field.slug, e.target.value)}
						placeholder={field.placeholder ?? ""}
					/>
				);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Link href="/leads" className="hover:text-foreground flex items-center gap-1">
					<HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
					Back to Leads
				</Link>
			</div>

			<PageHeader
				title={`${lead.firstName} ${lead.lastName}`}
				description={`Lead created ${formatDate(lead.createdAt)}`}
				actions={
					<div className="flex gap-2">
						{!isConverted && !isClosed && (
							<>
								<Button
									size="sm"
									variant="outline"
									onClick={handleAdvanceStatus}
									disabled={isPending || lead.status === "contract_signed"}
								>
									<HugeiconsIcon icon={ArrowRight01Icon} size={14} className="mr-1" />
									Advance
								</Button>
								<Button size="sm" onClick={() => setConvertOpen(true)}>
									Convert to Case
								</Button>
							</>
						)}
					</div>
				}
			/>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Lead Info */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Lead Information</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">Status</span>
							<Badge className={STATUS_COLORS[lead.status] ?? ""}>
								{STATUS_LABELS[lead.status] ?? lead.status}
							</Badge>
						</div>
						<Separator />
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">Source</span>
							<span className="text-sm">{lead.source ?? "Unknown"}</span>
						</div>
						<Separator />
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">Created</span>
							<span className="text-sm">{formatDate(lead.createdAt)}</span>
						</div>
						<Separator />
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">Updated</span>
							<span className="text-sm">{formatDate(lead.updatedAt)}</span>
						</div>
						{lead.lastContactedAt && (
							<>
								<Separator />
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground w-24">Last Contact</span>
									<span className="text-sm">{formatDate(lead.lastContactedAt)}</span>
								</div>
							</>
						)}
						{isConverted && lead.convertedToCaseId && (
							<>
								<Separator />
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground w-24">Converted</span>
									<Link
										href={`/cases/${lead.convertedToCaseId}`}
										className="text-sm text-primary hover:underline"
									>
										View Case
									</Link>
								</div>
							</>
						)}
					</CardContent>
				</Card>

				{/* Contact Details */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Contact Details</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">Name</span>
							<span className="text-sm font-medium">
								{lead.firstName} {lead.lastName}
							</span>
						</div>
						<Separator />
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">
								<HugeiconsIcon icon={Mail01Icon} size={14} className="inline mr-1" />
								Email
							</span>
							{lead.email ? (
								<a
									href={`mailto:${lead.email}`}
									className="text-sm text-primary hover:underline"
								>
									{lead.email}
								</a>
							) : (
								<span className="text-sm text-muted-foreground">Not provided</span>
							)}
						</div>
						<Separator />
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground w-24">
								<HugeiconsIcon icon={Call02Icon} size={14} className="inline mr-1" />
								Phone
							</span>
							{lead.phone ? (
								<a
									href={`tel:${lead.phone}`}
									className="text-sm text-primary hover:underline"
								>
									{lead.phone}
								</a>
							) : (
								<span className="text-sm text-muted-foreground">Not provided</span>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Notes */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Notes</CardTitle>
					</CardHeader>
					<CardContent>
						{lead.notes ? (
							<p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
						) : (
							<p className="text-sm text-muted-foreground">No notes recorded.</p>
						)}
					</CardContent>
				</Card>

				{/* eSignature / Contract */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="text-base">Contracts</CardTitle>
						{!isConverted && !isClosed && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setContractOpen(true)}
								disabled={isPending}
							>
								Send Contract
							</Button>
						)}
					</CardHeader>
					<CardContent>
						{signatureRequests.length > 0 ? (
							<div className="space-y-3">
								{signatureRequests.map((sr) => (
									<div key={sr.id} className="flex items-center justify-between rounded-md border p-3">
										<div className="space-y-1">
											<p className="text-sm font-medium">{sr.signerName}</p>
											<p className="text-xs text-muted-foreground">{sr.signerEmail}</p>
											{sr.contractType && (
												<p className="text-xs text-muted-foreground capitalize">
													{sr.contractType.replace(/_/g, " ")}
												</p>
											)}
										</div>
										<div className="flex flex-col items-end gap-1">
											<Badge className={SIG_STATUS_COLORS[sr.status] ?? ""}>
												{sr.status}
											</Badge>
											{sr.sentAt && (
												<span className="text-xs text-muted-foreground">
													Sent {new Date(sr.sentAt).toLocaleDateString()}
												</span>
											)}
											{sr.signedAt && (
												<span className="text-xs text-green-600">
													Signed {new Date(sr.signedAt).toLocaleDateString()}
												</span>
											)}
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No contracts sent yet.
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Intake Form Section */}
			{intakeFields.length > 0 && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="text-base">Intake Form</CardTitle>
						{!isConverted && !isClosed && (
							<div className="flex items-center gap-2">
								{intakeSaved && (
									<span className="text-xs text-green-600">Saved</span>
								)}
								<Button
									size="sm"
									onClick={handleSaveIntake}
									disabled={isPending}
								>
									{isPending ? "Saving..." : "Save Intake"}
								</Button>
							</div>
						)}
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 md:grid-cols-2">
							{intakeFields.map((field) => (
								<div key={field.id} className="space-y-1.5">
									{field.fieldType !== "boolean" && (
										<Label>
											{field.name}
											{field.isRequired && <span className="text-red-500 ml-1">*</span>}
										</Label>
									)}
									{field.intakeFormScript && (
										<p className="text-xs text-blue-600 dark:text-blue-400 italic mb-1">
											Script: &quot;{field.intakeFormScript}&quot;
										</p>
									)}
									{renderIntakeField(field)}
									{field.helpText && (
										<p className="text-xs text-muted-foreground">{field.helpText}</p>
									)}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Intake Data (read-only view of saved data) */}
			{lead.intakeData && Object.keys(lead.intakeData).length > 0 && intakeFields.length === 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Intake Data</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{Object.entries(lead.intakeData).map(([key, value]) => (
								<div key={key} className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground capitalize">
										{key.replace(/_/g, " ")}
									</span>
									<span className="text-sm">{String(value)}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Convert to Case Dialog */}
			<Dialog open={convertOpen} onOpenChange={setConvertOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Convert Lead to Case</DialogTitle>
						<DialogDescription>
							This will create a new case for {lead.firstName} {lead.lastName} and
							mark this lead as converted. A contact record will be created
							automatically.
						</DialogDescription>
					</DialogHeader>
					<div className="py-4 space-y-4">
						<div className="space-y-1.5">
							<Label>Initial Stage</Label>
							<Select value={convertStageId} onValueChange={setConvertStageId}>
								<SelectTrigger>
									<SelectValue placeholder="Select initial stage" />
								</SelectTrigger>
								<SelectContent>
									{(initialStages.length > 0 ? initialStages : stages).map(
										(s) => (
											<SelectItem key={s.id} value={s.id}>
												{s.code} - {s.name}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>
						<div className="rounded-md bg-muted p-3 text-sm">
							<p className="font-medium">What will happen:</p>
							<ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
								<li>A new contact record for {lead.firstName} {lead.lastName}</li>
								<li>A new case linked to this lead</li>
								<li>Lead status updated to &quot;Converted&quot;</li>
								{lead.intakeData && Object.keys(lead.intakeData).length > 0 && (
									<li>Intake data auto-populated as custom field values</li>
								)}
								<li>Any workflows for the initial stage will run</li>
							</ul>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConvertOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleConvert}
							disabled={!convertStageId || isPending}
						>
							{isPending ? "Converting..." : "Convert to Case"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Send Contract Dialog */}
			<Dialog open={contractOpen} onOpenChange={setContractOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send Contract</DialogTitle>
						<DialogDescription>
							Send a retainer agreement to {lead.firstName} {lead.lastName} for
							electronic signature.
						</DialogDescription>
					</DialogHeader>
					<div className="py-4 space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="signer-name">Signer Name</Label>
							<Input
								id="signer-name"
								value={signerName}
								onChange={(e) => setSignerName(e.target.value)}
								placeholder="Full name"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="signer-email">Signer Email</Label>
							<Input
								id="signer-email"
								type="email"
								value={signerEmail}
								onChange={(e) => setSignerEmail(e.target.value)}
								placeholder="email@example.com"
							/>
						</div>
						<div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
							The contract will be tracked here. Actual signing happens through
							your external eSignature provider.
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setContractOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleSendContract}
							disabled={!signerEmail || !signerName || isPending}
						>
							{isPending ? "Sending..." : "Send Contract"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
