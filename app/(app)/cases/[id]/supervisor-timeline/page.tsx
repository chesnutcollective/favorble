import { requireSession } from "@/lib/auth/session";
import { getSupervisorEventsForCase } from "@/lib/services/supervisor-events";
import { db } from "@/db/drizzle";
import { tasks, aiDrafts, notifications } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";
import { resolveEventAction, dismissEventAction } from "./actions";

type Step = {
  at: string;
  status: string;
  by: string;
  note?: string;
};

const SEVERITY: Record<
  string,
  { label: string; bg: string; fg: string; severity: "red" | "amber" | "green" | "blue" }
> = {
  denial_received: {
    label: "Denial received",
    bg: COLORS.badSubtle,
    fg: COLORS.bad,
    severity: "red",
  },
  unfavorable_decision: {
    label: "Unfavorable decision",
    bg: COLORS.badSubtle,
    fg: COLORS.bad,
    severity: "red",
  },
  missed_task_deadline: {
    label: "Missed deadline",
    bg: COLORS.badSubtle,
    fg: COLORS.bad,
    severity: "red",
  },
  appeal_deadline_approaching: {
    label: "Appeal deadline approaching",
    bg: COLORS.warnSubtle,
    fg: COLORS.warn,
    severity: "amber",
  },
  stagnant_case: {
    label: "Stagnant case",
    bg: COLORS.warnSubtle,
    fg: COLORS.warn,
    severity: "amber",
  },
  workload_imbalance: {
    label: "Workload imbalance",
    bg: COLORS.warnSubtle,
    fg: COLORS.warn,
    severity: "amber",
  },
  compliance_violation: {
    label: "Compliance violation",
    bg: COLORS.badSubtle,
    fg: COLORS.bad,
    severity: "red",
  },
  favorable_decision: {
    label: "Favorable decision",
    bg: "rgba(34,155,87,0.10)",
    fg: "#0f9b54",
    severity: "green",
  },
  fee_awarded: {
    label: "Fee awarded",
    bg: "rgba(34,155,87,0.10)",
    fg: "#0f9b54",
    severity: "green",
  },
  hearing_scheduled: {
    label: "Hearing scheduled",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  hearing_rescheduled: {
    label: "Hearing rescheduled",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  new_medical_evidence: {
    label: "New medical evidence",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  rfc_received: {
    label: "RFC received",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  mr_complete: {
    label: "Medical records complete",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  appeal_window_opened: {
    label: "Appeal window opened",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  ssa_status_change: {
    label: "SSA status change",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  client_message_received: {
    label: "Client message",
    bg: COLORS.okSubtle,
    fg: COLORS.ok,
    severity: "blue",
  },
  client_sentiment_risk: {
    label: "Client sentiment risk",
    bg: COLORS.warnSubtle,
    fg: COLORS.warn,
    severity: "amber",
  },
};

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SupervisorTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  await requireSession();

  const events = await getSupervisorEventsForCase(caseId);

  // Collect linked artifact ids across all events
  const taskIds = new Set<string>();
  const draftIds = new Set<string>();
  const notificationIds = new Set<string>();
  for (const e of events) {
    for (const id of e.linkedTaskIds ?? []) taskIds.add(id);
    for (const id of e.linkedDraftIds ?? []) draftIds.add(id);
    for (const id of e.linkedNotificationIds ?? []) notificationIds.add(id);
  }

  // Fetch them all in one go per artifact type
  const [linkedTasks, linkedDrafts, linkedNotifications] = await Promise.all([
    taskIds.size > 0
      ? db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            assignedToId: tasks.assignedToId,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(inArray(tasks.id, Array.from(taskIds)))
      : Promise.resolve([]),
    draftIds.size > 0
      ? db
          .select({
            id: aiDrafts.id,
            title: aiDrafts.title,
            status: aiDrafts.status,
            type: aiDrafts.type,
          })
          .from(aiDrafts)
          .where(inArray(aiDrafts.id, Array.from(draftIds)))
      : Promise.resolve([]),
    notificationIds.size > 0
      ? db
          .select({
            id: notifications.id,
            title: notifications.title,
            readAt: notifications.readAt,
          })
          .from(notifications)
          .where(inArray(notifications.id, Array.from(notificationIds)))
      : Promise.resolve([]),
  ]);

  const taskById = new Map(linkedTasks.map((t) => [t.id, t]));
  const draftById = new Map(linkedDrafts.map((d) => [d.id, d]));
  const notifById = new Map(linkedNotifications.map((n) => [n.id, n]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Supervisor timeline
        </h2>
        <p className="text-sm text-muted-foreground">
          Events the AI Supervisor detected on this case and how the team
          responded.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No supervisor events for this case yet. Events appear here when
            the system detects a denial, missed deadline, stagnant case, or
            similar trigger.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const meta = SEVERITY[event.eventType] ?? {
              label: event.eventType,
              bg: "rgba(139,139,151,0.12)",
              fg: COLORS.text2,
              severity: "blue" as const,
            };
            const steps = (event.steps ?? []) as Step[];
            const isOpen =
              event.status !== "resolved" && event.status !== "dismissed";
            return (
              <Card key={event.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor: meta.bg,
                            color: meta.fg,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.detectedAt)}
                        </span>
                        <StatusPill status={event.status} />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {event.summary}
                      </p>
                      {event.recommendedAction && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold">Recommended:</span>{" "}
                          {event.recommendedAction}
                        </p>
                      )}
                    </div>
                    {isOpen && (
                      <div className="flex shrink-0 gap-2">
                        <form action={resolveEventAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="caseId" value={caseId} />
                          <button
                            type="submit"
                            className="rounded-md border border-[#EAEAEA] bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-[#F8F9FC]"
                          >
                            Mark resolved
                          </button>
                        </form>
                        <form action={dismissEventAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="caseId" value={caseId} />
                          <button
                            type="submit"
                            className="rounded-md border border-[#EAEAEA] bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-[#F8F9FC]"
                          >
                            Dismiss
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Steps timeline */}
                  {steps.length > 0 && (
                    <div className="border-l-2 border-[#EAEAEA] pl-4 space-y-2">
                      {steps.map((step, i) => (
                        <div key={i} className="relative">
                          <span
                            className="absolute -left-[21px] top-1 h-2 w-2 rounded-full"
                            style={{ backgroundColor: COLORS.brand }}
                          />
                          <div className="flex items-baseline gap-2 text-xs">
                            <span className="font-semibold text-foreground">
                              {step.status.replace(/_/g, " ")}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDateTime(step.at)}
                            </span>
                            <span className="text-muted-foreground">
                              by {step.by === "system" ? "system" : "user"}
                            </span>
                          </div>
                          {step.note && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Linked artifacts */}
                  {(event.linkedTaskIds?.length ||
                    event.linkedDraftIds?.length ||
                    event.linkedNotificationIds?.length) && (
                    <div className="border-t border-[#F0F0F0] pt-3 space-y-2">
                      {(event.linkedTaskIds?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Tasks
                          </p>
                          <ul className="mt-1 space-y-1">
                            {(event.linkedTaskIds ?? []).map((id) => {
                              const t = taskById.get(id);
                              if (!t) return null;
                              return (
                                <li
                                  key={id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="truncate text-foreground">
                                    {t.title}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t.status}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {(event.linkedDraftIds?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Drafts
                          </p>
                          <ul className="mt-1 space-y-1">
                            {(event.linkedDraftIds ?? []).map((id) => {
                              const d = draftById.get(id);
                              if (!d) return null;
                              return (
                                <li
                                  key={id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="truncate text-foreground">
                                    {d.title}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {d.status}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {(event.linkedNotificationIds?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Notifications
                          </p>
                          <ul className="mt-1 space-y-1">
                            {(event.linkedNotificationIds ?? []).map((id) => {
                              const n = notifById.get(id);
                              if (!n) return null;
                              return (
                                <li
                                  key={id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="truncate text-foreground">
                                    {n.title}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {n.readAt ? "read" : "unread"}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isTerminal = status === "resolved" || status === "dismissed";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: isTerminal ? "rgba(139,139,151,0.12)" : COLORS.brandSubtle,
        color: isTerminal ? COLORS.text2 : COLORS.brand,
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
