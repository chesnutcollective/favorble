import { getCaseTasks } from "@/app/actions/tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseTasksClient } from "./tasks-client";

export default async function CaseTasksPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;

	let tasks: Awaited<ReturnType<typeof getCaseTasks>> = [];

	try {
		tasks = await getCaseTasks(caseId);
	} catch {
		// DB unavailable
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					Tasks ({tasks.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				<CaseTasksClient
					caseId={caseId}
					tasks={tasks.map((t) => ({
						...t,
						dueDate: t.dueDate?.toISOString() ?? null,
						completedAt: t.completedAt?.toISOString() ?? null,
						createdAt: t.createdAt.toISOString(),
					}))}
				/>
			</CardContent>
		</Card>
	);
}
