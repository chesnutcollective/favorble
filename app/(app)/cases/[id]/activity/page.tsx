import { getCaseActivity } from "@/app/actions/cases";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CaseActivityPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;

	let activity: Awaited<ReturnType<typeof getCaseActivity>> = [];

	try {
		activity = await getCaseActivity(caseId);
	} catch {
		// DB unavailable
	}

	const events: TimelineEvent[] = activity.map((a) => ({
		id: a.id,
		type: a.fromStageId ? "stage_changed" : "case_created",
		title: a.fromStageId ? "Stage changed" : "Case created",
		description: a.notes ?? undefined,
		timestamp: a.transitionedAt.toISOString(),
		actor: a.userName ?? undefined,
	}));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Activity Timeline</CardTitle>
			</CardHeader>
			<CardContent>
				<Timeline events={events} />
			</CardContent>
		</Card>
	);
}
