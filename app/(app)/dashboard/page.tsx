import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getActiveCaseCount, getCaseCountsByStage } from "@/app/actions/cases";
import { getTasksDueTodayCount, getOverdueTaskCount, getMyQueue } from "@/app/actions/tasks";
import { StatsCard } from "@/components/shared/stats-card";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Dashboard",
};

export default async function DashboardPage() {
	const user = await requireSession();

	const [activeCases, tasksDueToday, overdueTaskCount, stageBreakdown, myTasks] =
		await Promise.all([
			getActiveCaseCount(),
			getTasksDueTodayCount(),
			getOverdueTaskCount(),
			getCaseCountsByStage(),
			getMyQueue({ dueDateRange: "today" }),
		]);

	// Group stage counts by stage group
	const groupedStages = new Map<
		string,
		{ name: string; color: string | null; count: number }
	>();
	for (const s of stageBreakdown) {
		const existing = groupedStages.get(s.stageGroupName);
		if (existing) {
			existing.count += s.count;
		} else {
			groupedStages.set(s.stageGroupName, {
				name: s.stageGroupName,
				color: s.stageGroupColor,
				count: s.count,
			});
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Dashboard"
				description={`Welcome back, ${user.firstName}.`}
			/>

			{/* Metric Cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatsCard title="Active Cases" value={activeCases} />
				<StatsCard
					title="Tasks Due Today"
					value={tasksDueToday}
					subtitle={
						overdueTaskCount > 0
							? `${overdueTaskCount} overdue`
							: undefined
					}
				/>
				<StatsCard
					title="Stage Groups"
					value={groupedStages.size}
				/>
				<StatsCard
					title="Pipeline Stages"
					value={stageBreakdown.length}
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* My Tasks Due Today */}
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base">My Tasks (Due Today)</CardTitle>
							<Link
								href="/queue"
								className="text-sm text-primary hover:underline"
							>
								View All
							</Link>
						</div>
					</CardHeader>
					<CardContent>
						{myTasks.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4 text-center">
								No tasks due today
							</p>
						) : (
							<div className="space-y-2">
								{myTasks.slice(0, 5).map((task) => (
									<div
										key={task.id}
										className="flex items-start gap-3 rounded-md p-2 hover:bg-accent"
									>
										<Checkbox className="mt-0.5" />
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium text-foreground truncate">
												{task.title}
											</p>
											<div className="flex items-center gap-2 mt-0.5">
												<Link
													href={`/cases/${task.caseId}`}
													className="text-xs text-primary hover:underline"
												>
													{task.caseNumber}
												</Link>
												{task.stageName && (
													<Badge
														variant="outline"
														className="text-xs"
														style={{
															borderColor:
																task.stageGroupColor ?? undefined,
															color:
																task.stageGroupColor ?? undefined,
														}}
													>
														{task.stageName}
													</Badge>
												)}
											</div>
										</div>
										{task.priority === "urgent" || task.priority === "high" ? (
											<Badge variant="destructive" className="text-xs shrink-0">
												{task.priority}
											</Badge>
										) : null}
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Cases by Stage Group */}
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base">Cases by Stage</CardTitle>
							<Link
								href="/cases"
								className="text-sm text-primary hover:underline"
							>
								View All
							</Link>
						</div>
					</CardHeader>
					<CardContent>
						{groupedStages.size === 0 ? (
							<p className="text-sm text-muted-foreground py-4 text-center">
								No active cases
							</p>
						) : (
							<div className="space-y-3">
								{Array.from(groupedStages.values()).map((group) => (
									<div key={group.name} className="flex items-center gap-3">
										<div
											className="h-3 w-3 rounded-full shrink-0"
											style={{
												backgroundColor: group.color ?? "#6B7280",
											}}
										/>
										<span className="text-sm text-foreground flex-1">
											{group.name}
										</span>
										<div className="flex items-center gap-2">
											<div
												className="h-2 rounded-full"
												style={{
													width: `${Math.max(
														(group.count / Math.max(activeCases, 1)) * 200,
														8,
													)}px`,
													backgroundColor: group.color ?? "#6B7280",
												}}
											/>
											<span className="text-sm font-medium text-foreground w-8 text-right">
												{group.count}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
