import type { Metadata } from "next";
import { getMyQueue, getQueueCounts } from "@/app/actions/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { QueueClient } from "./client";

export const metadata: Metadata = {
	title: "My Queue",
};

export default async function QueuePage() {
	const [tasks, counts] = await Promise.all([
		getMyQueue(),
		getQueueCounts(),
	]);

	return (
		<div className="space-y-4">
			<PageHeader
				title="My Queue"
				description="Your assigned tasks and work items."
			/>
			<QueueClient
				initialTasks={tasks.map((t) => ({
					...t,
					dueDate: t.dueDate?.toISOString() ?? null,
					createdAt: t.createdAt.toISOString(),
				}))}
				counts={counts}
			/>
		</div>
	);
}
