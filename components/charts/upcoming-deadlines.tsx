"use client";

import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";

type DeadlineEvent = {
  id: string;
  title: string;
  eventType: string;
  startAt: Date;
  caseId: string | null;
  caseNumber: string | null;
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  hearing: "bg-red-100 text-red-700",
  deadline: "bg-orange-100 text-orange-700",
  appointment: "bg-blue-100 text-blue-700",
  follow_up: "bg-purple-100 text-purple-700",
  reminder: "bg-yellow-100 text-yellow-700",
};

export function UpcomingDeadlines({ events }: { events: DeadlineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No upcoming deadlines
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-3 rounded-md p-2 hover:bg-accent"
        >
          <Badge
            className={`text-xs shrink-0 ${EVENT_TYPE_COLORS[event.eventType] ?? "bg-muted text-foreground"}`}
          >
            {event.eventType.replace(/_/g, " ")}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {event.title}
            </p>
            {event.caseId && event.caseNumber && (
              <Link
                href={`/cases/${event.caseId}`}
                className="text-xs text-primary hover:underline"
              >
                {event.caseNumber}
              </Link>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {format(event.startAt, "MMM d, yyyy")}
          </span>
        </div>
      ))}
    </div>
  );
}
