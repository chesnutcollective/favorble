import type { Metadata } from "next";
import { getStageGroupsWithStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

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
	} catch {
		// DB unavailable
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Case Stages"
				description="Configure stage groups and case stages."
				actions={
					<Button size="sm">
						<HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
						Add Group
					</Button>
				}
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
									<div className="space-y-2">
										{group.stages.map((stage) => (
											<div
												key={stage.id}
												className="flex items-center justify-between rounded-md border p-3"
											>
												<div className="flex items-center gap-3">
													<code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
														{stage.code}
													</code>
													<span className="text-sm font-medium text-foreground">
														{stage.name}
													</span>
													{stage.isInitial && (
														<Badge
															variant="outline"
															className="text-xs text-green-600 border-green-300"
														>
															Initial
														</Badge>
													)}
													{stage.isTerminal && (
														<Badge
															variant="outline"
															className="text-xs text-muted-foreground"
														>
															Terminal
														</Badge>
													)}
												</div>
												<div className="flex items-center gap-2">
													{stage.owningTeam && (
														<Badge variant="secondary" className="text-xs">
															{TEAM_LABELS[stage.owningTeam] ??
																stage.owningTeam}
														</Badge>
													)}
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
								)}
								<Button
									variant="ghost"
									size="sm"
									className="mt-2 text-xs"
								>
									<HugeiconsIcon icon={PlusSignIcon} size={12} className="mr-1" />
									Add Stage
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
