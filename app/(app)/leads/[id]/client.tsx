"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { convertLeadToCase, updateLeadStatus } from "@/app/actions/leads";
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
}: {
	lead: LeadDetail;
	stages: Stage[];
}) {
	const router = useRouter();
	const [convertOpen, setConvertOpen] = useState(false);
	const [convertStageId, setConvertStageId] = useState("");
	const [isPending, startTransition] = useTransition();

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

				{/* Intake Data */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Intake Data</CardTitle>
					</CardHeader>
					<CardContent>
						{lead.intakeData &&
						Object.keys(lead.intakeData).length > 0 ? (
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
						) : (
							<p className="text-sm text-muted-foreground">
								No intake data collected yet.
							</p>
						)}
					</CardContent>
				</Card>
			</div>

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
		</div>
	);
}
