import { getCaseActivity } from "@/app/actions/cases";
import { getCaseNotes } from "@/app/actions/notes";
import { getCaseEmails } from "@/app/actions/emails";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddNoteForm } from "./add-note-form";
import { db } from "@/db/drizzle";
import { users, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function CaseActivityPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;

	let activity: Awaited<ReturnType<typeof getCaseActivity>> = [];
	let notes: Awaited<ReturnType<typeof getCaseNotes>> = [];
	let emails: Awaited<ReturnType<typeof getCaseEmails>> = [];

	type AuditRow = {
		id: string;
		userId: string | null;
		action: string;
		changes: unknown;
		createdAt: Date;
	};
	let workflowLogs: AuditRow[] = [];

	try {
		[activity, notes, emails] = await Promise.all([
			getCaseActivity(caseId),
			getCaseNotes(caseId),
			getCaseEmails(caseId),
		]);

		// Fetch workflow execution audit log entries for this case
		const rawLogs = await db
			.select({
				id: auditLog.id,
				userId: auditLog.userId,
				action: auditLog.action,
				changes: auditLog.changes,
				createdAt: auditLog.createdAt,
			})
			.from(auditLog)
			.where(
				and(
					eq(auditLog.entityType, "workflow"),
					eq(auditLog.action, "workflow_executed"),
				),
			);

		// Filter to entries for this case (caseId is stored in the changes JSON)
		workflowLogs = rawLogs.filter((row) => {
			const changes = row.changes as Record<string, unknown> | null;
			return changes && changes.caseId === caseId;
		});
	} catch {
		// DB unavailable
	}

	// Build a map of user IDs to names for notes and workflow events
	const noteUserIds = [...new Set(notes.map((n) => n.userId).filter(Boolean))] as string[];
	const workflowUserIds = workflowLogs.map((w) => w.userId).filter(Boolean) as string[];
	const allUserIds = [...new Set([...noteUserIds, ...workflowUserIds])];
	const userMap = new Map<string, string>();

	if (allUserIds.length > 0) {
		try {
			for (const uid of allUserIds) {
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

	const noteEvents: TimelineEvent[] = notes.map((n) => {
		const meta = (n.metadata ?? {}) as Record<string, unknown>;
		return {
			id: n.id,
			type: "note_added",
			title: "Note added",
			description: n.body ?? undefined,
			timestamp: n.createdAt.toISOString(),
			actor: n.userId ? userMap.get(n.userId) ?? undefined : undefined,
			caseId,
			metadata: {
				noteType: meta.noteType ?? "general",
				tags: meta.tags ?? [],
				mentionedUserIds: meta.mentionedUserIds ?? [],
				isPinned: meta.isPinned ?? false,
			},
		};
	});

	const emailEvents: TimelineEvent[] = emails.map((e) => ({
		id: e.id,
		type: e.type === "email_inbound" ? "email_received" : "email_sent",
		title: e.type === "email_inbound" ? "Email received" : "Email sent",
		description: [
			e.subject ? `**${e.subject}**` : null,
			e.body ?? null,
		]
			.filter(Boolean)
			.join("\n"),
		timestamp: e.createdAt.toISOString(),
		actor: e.fromAddress ?? undefined,
		metadata: {
			toAddress: e.toAddress,
			direction: e.direction,
		},
	}));

	const workflowEvents: TimelineEvent[] = workflowLogs.map((w) => {
		const changes = w.changes as Record<string, unknown> | null;
		const tasksCreated =
			typeof changes?.tasksCreated === "number" ? changes.tasksCreated : 0;
		return {
			id: w.id,
			type: "workflow_executed",
			title: "Workflow triggered",
			description: `${tasksCreated} task${tasksCreated !== 1 ? "s" : ""} created`,
			timestamp: w.createdAt.toISOString(),
			actor: w.userId ? (userMap.get(w.userId) ?? undefined) : undefined,
		};
	});

	// Merge and sort by timestamp descending
	const events = [...transitionEvents, ...noteEvents, ...emailEvents, ...workflowEvents].sort(
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
