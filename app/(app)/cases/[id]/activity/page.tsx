import { getCaseActivity } from "@/app/actions/cases";
import { getCaseNotes } from "@/app/actions/notes";
import { getCaseEmails } from "@/app/actions/emails";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddNoteForm } from "./add-note-form";
import { db } from "@/db/drizzle";
import { users, auditLog, communications, aiDrafts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

  type CommRow = {
    id: string;
    type: string;
    direction: string | null;
    subject: string | null;
    body: string | null;
    fromAddress: string | null;
    toAddress: string | null;
    createdAt: Date;
  };
  let commRows: CommRow[] = [];

  type DraftRow = {
    id: string;
    type: string;
    status: string;
    title: string;
    body: string;
    assignedReviewerId: string | null;
    approvedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  let draftRows: DraftRow[] = [];

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

    // Fetch communications (CM-5 timeline thread)
    commRows = await db
      .select({
        id: communications.id,
        type: communications.type,
        direction: communications.direction,
        subject: communications.subject,
        body: communications.body,
        fromAddress: communications.fromAddress,
        toAddress: communications.toAddress,
        createdAt: communications.createdAt,
      })
      .from(communications)
      .where(eq(communications.caseId, caseId))
      .orderBy(desc(communications.createdAt))
      .limit(200);

    // Fetch AI drafts (CM-2 / CM-4 timeline thread)
    draftRows = await db
      .select({
        id: aiDrafts.id,
        type: aiDrafts.type,
        status: aiDrafts.status,
        title: aiDrafts.title,
        body: aiDrafts.body,
        assignedReviewerId: aiDrafts.assignedReviewerId,
        approvedBy: aiDrafts.approvedBy,
        createdAt: aiDrafts.createdAt,
        updatedAt: aiDrafts.updatedAt,
      })
      .from(aiDrafts)
      .where(eq(aiDrafts.caseId, caseId))
      .orderBy(desc(aiDrafts.createdAt))
      .limit(200);
  } catch {
    // DB unavailable
  }

  // Build a map of user IDs to names for notes, workflow events, and drafts
  const noteUserIds = [
    ...new Set(notes.map((n) => n.userId).filter(Boolean)),
  ] as string[];
  const workflowUserIds = workflowLogs
    .map((w) => w.userId)
    .filter(Boolean) as string[];
  const draftUserIds = [
    ...draftRows.map((d) => d.assignedReviewerId),
    ...draftRows.map((d) => d.approvedBy),
  ].filter(Boolean) as string[];
  const allUserIds = [
    ...new Set([...noteUserIds, ...workflowUserIds, ...draftUserIds]),
  ];
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
      actor: n.userId ? (userMap.get(n.userId) ?? undefined) : undefined,
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
    description: [e.subject ? `**${e.subject}**` : null, e.body ?? null]
      .filter(Boolean)
      .join("\n"),
    timestamp: e.createdAt.toISOString(),
    actor: e.fromAddress ?? undefined,
    metadata: {
      toAddress: e.toAddress,
      direction: e.direction,
    },
  }));

  // Emails are already covered above — filter comm rows so we don't
  // double-render email_inbound / email_outbound events.
  const commEvents: TimelineEvent[] = commRows
    .filter(
      (c) => c.type !== "email_inbound" && c.type !== "email_outbound",
    )
    .map((c) => {
      const isInbound =
        c.direction === "inbound" || c.type.endsWith("_inbound");
      const typeLabel = c.type.startsWith("message")
        ? "Message"
        : c.type.startsWith("phone")
          ? "Phone call"
          : "Communication";
      return {
        id: `comm-${c.id}`,
        type: isInbound ? "message_received" : "message_sent",
        title: `${typeLabel} ${isInbound ? "received" : "sent"}`,
        description: [
          c.subject ? `**${c.subject}**` : null,
          c.body
            ? c.body.length > 280
              ? c.body.slice(0, 280) + "…"
              : c.body
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        timestamp: c.createdAt.toISOString(),
        actor: isInbound
          ? (c.fromAddress ?? undefined)
          : (c.toAddress ?? undefined),
      };
    });

  const draftEvents: TimelineEvent[] = draftRows.map((d) => {
    const statusLabel =
      d.status === "sent"
        ? "AI draft sent"
        : d.status === "approved"
          ? "AI draft approved"
          : d.status === "rejected"
            ? "AI draft rejected"
            : d.status === "error"
              ? "AI draft failed"
              : "AI draft generated";
    const actorId = d.approvedBy ?? d.assignedReviewerId;
    return {
      id: `draft-${d.id}`,
      type: `ai_draft_${d.status}`,
      title: `${statusLabel} · ${d.type}`,
      description:
        d.body.length > 280 ? d.body.slice(0, 280) + "…" : d.body || d.title,
      timestamp: (d.updatedAt ?? d.createdAt).toISOString(),
      actor: actorId ? (userMap.get(actorId) ?? undefined) : undefined,
    };
  });

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
  const events = [
    ...transitionEvents,
    ...noteEvents,
    ...emailEvents,
    ...commEvents,
    ...draftEvents,
    ...workflowEvents,
  ].sort(
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
