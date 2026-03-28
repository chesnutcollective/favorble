import Link from "next/link";
import { getCaseById } from "@/app/actions/cases";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { notFound } from "next/navigation";
import { CaseTabNav } from "./tab-nav";
import { CaseStageSelector } from "@/components/cases/case-stage-selector";
import { SSNDisplay } from "@/components/cases/ssn-display";
import { decrypt, maskSSN } from "@/lib/encryption";

export default async function CaseDetailLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	let caseData: Awaited<ReturnType<typeof getCaseById>> = null;

	try {
		caseData = await getCaseById(id);
	} catch {
		// DB unavailable
	}

	if (!caseData) notFound();

	// Compute masked SSN if available
	let maskedSSN: string | null = null;
	if (caseData.ssnEncrypted) {
		try {
			const rawSSN = decrypt(caseData.ssnEncrypted);
			maskedSSN = maskSSN(rawSSN);
		} catch {
			maskedSSN = "***-**-****";
		}
	}

	// Find current stage group index for progress bar
	const currentGroupId = caseData.stageGroupId;
	const currentGroupIndex = caseData.stageGroups.findIndex(
		(g) => g.id === currentGroupId,
	);

	return (
		<div className="space-y-4">
			{/* Back link */}
			<Link
				href="/cases"
				className="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Cases
			</Link>

			{/* Case Header */}
			<div className="flex flex-col lg:flex-row gap-4">
				<div className="flex-1 space-y-3">
					<div className="flex items-start justify-between gap-4">
						<div>
							<h1 className="text-2xl font-semibold text-foreground">
								{caseData.claimant
									? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
									: "Unknown Claimant"}
							</h1>
							<p className="text-sm text-muted-foreground">
								{caseData.caseNumber}
								{caseData.dateOfBirth && (
									<>
										{" "}
										&middot; DOB:{" "}
										{caseData.dateOfBirth.toLocaleDateString()}
									</>
								)}
							</p>
						</div>
						<CaseStageSelector
							caseId={caseData.id}
							currentStageId={caseData.currentStageId}
							currentStageName={caseData.stageName}
							currentStageGroupColor={caseData.stageGroupColor}
						/>
					</div>

					{/* Progress Bar */}
					<div className="flex items-center gap-1">
						{caseData.stageGroups.map((group, i) => {
							const isCompleted = i < currentGroupIndex;
							const isCurrent = i === currentGroupIndex;
							return (
								<div
									key={group.id}
									className="flex-1 h-2 rounded-full"
									style={{
										backgroundColor: isCompleted || isCurrent
											? (group.color ?? "#6B7280")
											: "#E5E7EB",
										opacity: isCurrent ? 1 : isCompleted ? 0.7 : 0.3,
									}}
									title={group.name}
								/>
							);
						})}
					</div>
					<div className="flex gap-4 text-xs text-muted-foreground">
						{caseData.stageGroups.map((group, i) => (
							<span
								key={group.id}
								className={
									i === currentGroupIndex
										? "font-medium text-foreground"
										: ""
								}
							>
								{group.name}
							</span>
						))}
					</div>
				</div>

				{/* Quick Info Sidebar */}
				<Card className="lg:w-64 shrink-0">
					<CardContent className="p-4 space-y-3">
						{caseData.assignedStaff.length > 0 && (
							<div>
								<p className="text-xs font-medium text-muted-foreground mb-1">
									Assigned Staff
								</p>
								<div className="space-y-1">
									{caseData.assignedStaff.map((staff) => (
										<div
											key={staff.id}
											className="flex items-center gap-2"
										>
											<Avatar className="h-5 w-5">
												<AvatarFallback className="text-[10px]">
													{staff.firstName[0]}
													{staff.lastName[0]}
												</AvatarFallback>
											</Avatar>
											<span className="text-xs text-foreground">
												{staff.firstName} {staff.lastName}
											</span>
											<span className="text-xs text-muted-foreground">
												{staff.role}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
						{maskedSSN && (
							<SSNDisplay
								caseId={caseData.id}
								maskedSSN={maskedSSN}
							/>
						)}
						{caseData.ssaOffice && (
							<InfoItem label="SSA Office" value={caseData.ssaOffice} />
						)}
						{caseData.createdAt && (
							<InfoItem
								label="Opened"
								value={caseData.createdAt.toLocaleDateString()}
							/>
						)}
						<div>
							<p className="text-xs font-medium text-muted-foreground">Case Status</p>
							{caseData.caseStatusExternalId ? (
								<a
									href={`https://app.casestatus.com/cases/${caseData.caseStatusExternalId}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline"
								>
									Open in Case Status
								</a>
							) : (
								<p className="text-xs text-muted-foreground">Not linked</p>
							)}
						</div>
						{caseData.chronicleUrl && (
							<div>
								<p className="text-xs font-medium text-muted-foreground">Chronicle</p>
								<a
									href={caseData.chronicleUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline"
								>
									Open in Chronicle
								</a>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Tabs */}
			<CaseTabNav caseId={id} />

			{/* Tab Content */}
			{children}
		</div>
	);
}

function InfoItem({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			<p className="text-sm text-foreground">{value}</p>
		</div>
	);
}
