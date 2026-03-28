import type { Metadata } from "next";
import { getStageGroupsWithStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	AddStageGroupDialog,
	AddStageDialog,
	DeleteStageButton,
} from "./stage-dialogs";
import { DraggableStageList } from "./draggable-stages";

export const metadata: Metadata = {
	title: "Case Stages",
};

const TEAM_LABELS: Record<string, string> = {
	intake: "Intake",
	filing: "Filing",
	medical_records: "Medical Records",
	mail_sorting: "Mail Sorting",
	case_management: "Case Mgmt",
	hearings: "Hearings",
	administration: "Admin",
};

export default async function StagesPage() {
	let stageGroups: Awaited<ReturnType<typeof getStageGroupsWithStages>> = [];

	try {
		stageGroups = await getStageGroupsWithStages();
	} catch (e) {
		console.error("Failed to load stages:", e);
		// Retry once
		try {
			stageGroups = await getStageGroupsWithStages();
		} catch {
			// Give up
		}
	}

	// Build flat list of all stages for the migration dialog
	const allStages = stageGroups.flatMap((g) =>
		g.stages.map((s) => ({ id: s.id, name: s.name, code: s.code })),
	);

	// Build stage groups list for the add stage dialog
	const stageGroupOptions = stageGroups.map((g) => ({
		id: g.id,
		name: g.name,
	}));

	return (
		<div className="space-y-6">
			<PageHeader
				title="Case Stages"
				description="Configure stage groups and case stages."
				actions={<AddStageGroupDialog />}
			/>

			{stageGroups.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-sm text-muted-foreground">
							No stage groups configured. Add your first group to get started.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{stageGroups.map((group) => (
						<Card key={group.id}>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div
											className="h-4 w-4 rounded-full"
											style={{
												backgroundColor:
													group.color ?? "#6B7280",
											}}
										/>
										<CardTitle className="text-base">
											{group.name}
										</CardTitle>
										{group.clientVisibleName && (
											<span className="text-xs text-muted-foreground">
												Client sees: &ldquo;{group.clientVisibleName}&rdquo;
											</span>
										)}
									</div>
									<Badge variant="secondary">
										{group.stages.length} stage
										{group.stages.length !== 1 ? "s" : ""}
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								{group.stages.length === 0 ? (
									<p className="text-sm text-muted-foreground py-2">
										No stages in this group.
									</p>
								) : (
									<DraggableStageList
										stages={group.stages.map((stage) => ({
											id: stage.id,
											name: stage.name,
											code: stage.code,
											color: stage.color,
											isInitial: stage.isInitial,
											isTerminal: stage.isTerminal,
											owningTeam: stage.owningTeam,
										}))}
										groupColor={group.color}
										allStages={allStages}
										teamLabels={TEAM_LABELS}
									/>
								)}
								<AddStageDialog
									stageGroups={stageGroupOptions}
									defaultGroupId={group.id}
								/>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
