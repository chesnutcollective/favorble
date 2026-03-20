import type { Metadata } from "next";
import { getWorkflowTemplates } from "@/app/actions/workflows";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Plus, Workflow, Zap } from "lucide-react";

export const metadata: Metadata = {
	title: "Workflow Templates",
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

export default async function WorkflowsPage() {
	const workflows = await getWorkflowTemplates();

	return (
		<div className="space-y-6">
			<PageHeader
				title="Workflow Templates"
				description="Configure automated workflows triggered by stage changes."
				actions={
					<Button size="sm">
						<Plus className="mr-1 h-4 w-4" />
						New Workflow
					</Button>
				}
			/>

			{workflows.length === 0 ? (
				<EmptyState
					icon={Workflow}
					title="No workflows"
					description="Create your first workflow to automate task generation when cases change stages."
				/>
			) : (
				<div className="space-y-4">
					{workflows.map((wf) => (
						<Card key={wf.id}>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<Zap className="h-4 w-4 text-amber-500" />
										<CardTitle className="text-base">
											{wf.name}
										</CardTitle>
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant={wf.isActive ? "default" : "secondary"}
											className="text-xs"
										>
											{wf.isActive ? "Active" : "Draft"}
										</Badge>
									</div>
								</div>
								{wf.description && (
									<p className="text-sm text-muted-foreground ml-7">
										{wf.description}
									</p>
								)}
								<p className="text-xs text-muted-foreground ml-7">
									Trigger: Stage &rarr;{" "}
									<span className="font-medium">
										{wf.triggerStageName ?? "Unknown"}
									</span>{" "}
									({wf.triggerStageCode})
								</p>
							</CardHeader>
							<CardContent>
								{wf.taskTemplates.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No tasks configured.
									</p>
								) : (
									<div className="rounded-md border">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b bg-accent">
													<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
														#
													</th>
													<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
														Task
													</th>
													<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
														Assign To
													</th>
													<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
														Due
													</th>
													<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
														Priority
													</th>
												</tr>
											</thead>
											<tbody>
												{wf.taskTemplates.map((tt, i) => (
													<tr
														key={tt.id}
														className="border-b last:border-0"
													>
														<td className="px-3 py-2 text-muted-foreground">
															{i + 1}
														</td>
														<td className="px-3 py-2 font-medium text-foreground">
															{tt.title}
														</td>
														<td className="px-3 py-2 text-muted-foreground">
															{tt.assignToTeam
																? TEAM_LABELS[tt.assignToTeam] ??
																	tt.assignToTeam
																: tt.assignToRole ?? "—"}
														</td>
														<td className="px-3 py-2 text-muted-foreground">
															+{tt.dueDaysOffset}{" "}
															{tt.dueBusinessDaysOnly
																? "bus"
																: "cal"}{" "}
															days
														</td>
														<td className="px-3 py-2">
															<Badge
																variant={
																	tt.priority === "urgent" ||
																	tt.priority === "high"
																		? "destructive"
																		: "outline"
																}
																className="text-xs"
															>
																{tt.priority}
															</Badge>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}

								<div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
									{wf.notifyAssignees && (
										<span>Notify assignees</span>
									)}
									{wf.notifyCaseManager && (
										<span>Notify case manager</span>
									)}
									{wf.sendClientMessage && (
										<span>Send client message</span>
									)}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
