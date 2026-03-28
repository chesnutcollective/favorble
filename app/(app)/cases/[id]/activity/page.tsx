import { getCaseActivity } from "@/app/actions/cases";
import { getCaseNotes } from "@/app/actions/notes";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddNoteForm } from "./add-note-form";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function CaseActivityPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;

	let activity: Awaited<ReturnType<typeof getCaseActivity>> = [];
	let notes: Awaited<ReturnType<typeof getCaseNotes>> = [];

	try {
		[activity, notes] = await Promise.all([
			getCaseActivity(caseId),
			getCaseNotes(caseId),
		]);
	} catch {
		// DB unavailable
	}

	// Build a map of user IDs to names for notes
	const noteUserIds = [...new Set(notes.map((n) => n.userId).filter(Boolean))] as string[];
	const userMap = new Map<string, string>();

	if (noteUserIds.length > 0) {
		try {
			for (const uid of noteUserIds) {
				const [user] = await db
					.select({ firstName: users.firstName, lastName: users.lastName })
					.from(users)
					.where(eq(users.id, uid))
					.limit(1);
				if (user) {
					userMap.set(uid, `${user.firstName} ${user.lastName}`);
				}
			}
		} catch {
			// DB unavailable
		}
	}

	const transitionEvents: TimelineEvent[] = activity.map((a) => ({
		id: a.id,
		type: a.fromStageId ? "stage_changed" : "case_created",
		title: a.fromStageId ? "Stage changed" : "Case created",
		description: a.notes ?? undefined,
		timestamp: a.transitionedAt.toISOString(),
		actor: a.userName ?? undefined,
	}));

	const noteEvents: TimelineEvent[] = notes.map((n) => ({
		id: n.id,
		type: "note_added",
		title: "Note added",
		description: n.body ?? undefined,
		timestamp: n.createdAt.toISOString(),
		actor: n.userId ? userMap.get(n.userId) ?? undefined : undefined,
	}));

	// Merge and sort by timestamp descending
	const events = [...transitionEvents, ...noteEvents].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	return (
		<div className="space-y-4">
			<AddNoteForm caseId={caseId} />

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Activity Timeline</CardTitle>
				</CardHeader>
				<CardContent>
					<Timeline events={events} />
				</CardContent>
			</Card>
		</div>
	);
}
