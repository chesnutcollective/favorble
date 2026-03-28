import type { Metadata } from "next";
import { getMyQueue, getQueueCounts } from "@/app/actions/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { QueueClient } from "./client";

export const metadata: Metadata = {
	title: "My Queue",
};

export default async function QueuePage() {
	let tasks: Awaited<ReturnType<typeof getMyQueue>> = [];
	let counts: Awaited<ReturnType<typeof getQueueCounts>> = {
		all: 0,
		overdue: 0,
		today: 0,
		thisWeek: 0,
		nextWeek: 0,
		noDate: 0,
	};

	try {
		[tasks, counts] = await Promise.all([
			getMyQueue(),
			getQueueCounts(),
		]);
	} catch {
		// DB unavailable
	}

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
