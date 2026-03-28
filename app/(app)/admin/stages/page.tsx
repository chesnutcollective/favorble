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
		console.error("Failed to load stages via action:", e);
	}

	// Fallback: direct query if action returned empty (connection pool issue)
	if (stageGroups.length === 0) {
		try {
			const pg = (await import("postgres")).default;
			const connStr = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").replace(/\\n$/, "").replace(/\n$/, "").trim();
			if (connStr) {
				const sql = pg(connStr, { prepare: false, max: 1, idle_timeout: 5 });
				const groups = await sql`SELECT * FROM case_stage_groups ORDER BY display_order ASC`;
				const stages = await sql`SELECT * FROM case_stages WHERE deleted_at IS NULL ORDER BY display_order ASC`;
				await sql.end();
				stageGroups = (groups as Record<string, unknown>[]).map((g) => ({
					...g,
					id: g.id as string,
					name: g.name as string,
					color: g.color as string | null,
					displayOrder: g.display_order as number,
					clientVisibleName: g.client_visible_name as string | null,
					organizationId: g.organization_id as string,
					stages: stages
						.filter((s: Record<string, unknown>) => s.stage_group_id === g.id)
						.map((s: Record<string, unknown>) => ({
							id: s.id as string,
							name: s.name as string,
							code: s.code as string,
							owningTeam: s.owning_team as string | null,
							isInitial: s.is_initial as boolean,
							isTerminal: s.is_terminal as boolean,
							stageGroupId: s.stage_group_id as string,
							displayOrder: s.display_order as number,
							color: s.color as string | null,
						})),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				})) as any;
			}
		} catch (e2) {
			console.error("Fallback stages query also failed:", e2);
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
