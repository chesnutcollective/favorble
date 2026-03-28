import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { calendarEvents, cases } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Calendar",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  hearing: "bg-blue-100 text-blue-700",
  deadline: "bg-red-100 text-red-700",
  appointment: "bg-green-100 text-green-700",
  follow_up: "bg-amber-100 text-amber-700",
  reminder: "bg-muted text-foreground",
};

async function fetchCalendarEvents(organizationId: string) {
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      location: calendarEvents.location,
      hearingOffice: calendarEvents.hearingOffice,
      adminLawJudge: calendarEvents.adminLawJudge,
      caseId: calendarEvents.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
    .where(
      and(
        eq(calendarEvents.organizationId, organizationId),
        gte(
          calendarEvents.startAt,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        ),
      ),
    )
    .orderBy(calendarEvents.startAt)
    .limit(100);
}

export default async function CalendarPage() {
  const user = await requireSession();

  let events: Awaited<ReturnType<typeof fetchCalendarEvents>> = [];

  try {
    events = await fetchCalendarEvents(user.organizationId);
  } catch {
    // DB unavailable
  }

  // Group events by date
  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    const dateKey = event.startAt.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const existing = eventsByDate.get(dateKey) ?? [];
    existing.push(event);
    eventsByDate.set(dateKey, existing);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Hearings, deadlines, and appointments."
      />

      {events.length === 0 ? (
        <EmptyState
          icon={Calendar01Icon}
          title="No upcoming events"
          description="Hearings, deadlines, and appointments will appear here."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(eventsByDate.entries()).map(([dateStr, dateEvents]) => {
            const isToday =
              dateStr ===
              new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              });
            const isPast =
              dateEvents[0] && dateEvents[0].startAt < new Date();

            return (
              <div key={dateStr}>
                <h3
                  className={`text-sm font-medium mb-2 ${
                    isToday
                      ? "text-primary"
                      : isPast
                        ? "text-muted-foreground"
                        : "text-foreground"
                  }`}
                >
                  {isToday ? `Today — ${dateStr}` : dateStr}
                </h3>
                <div className="space-y-2">
                  {dateEvents.map((event) => (
                    <Card key={event.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`text-xs ${
                                  EVENT_TYPE_COLORS[event.eventType] ?? ""
                                }`}
                              >
                                {event.eventType}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">
                                {event.title}
                              </span>
                            </div>
                            {event.description && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {event.description}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {event.caseId && event.caseNumber && (
                                <Link
                                  href={`/cases/${event.caseId}/calendar`}
                                  className="text-primary hover:underline"
                                >
                                  Case #{event.caseNumber}
                                </Link>
                              )}
                              {event.location && (
                                <span>{event.location}</span>
                              )}
                              {event.hearingOffice && (
                                <span>Office: {event.hearingOffice}</span>
                              )}
                              {event.adminLawJudge && (
                                <span>ALJ: {event.adminLawJudge}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-medium text-foreground">
                              {event.startAt.toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                            {event.endAt && (
                              <p className="text-xs text-muted-foreground">
                                to{" "}
                                {event.endAt.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
