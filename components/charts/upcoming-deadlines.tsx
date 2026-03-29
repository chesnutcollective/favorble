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

export function UpcomingDeadlines({ events }: { events: DeadlineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-[#999] py-4 text-center">
        No upcoming deadlines
      </p>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-3 py-2.5 border-b border-[#EAEAEA] last:border-b-0"
        >
          <Badge variant="outline" className="text-xs shrink-0 font-mono">
            {event.eventType.replace(/_/g, " ")}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {event.title}
            </p>
            {event.caseId && event.caseNumber && (
              <Link
                href={`/cases/${event.caseId}`}
                className="text-xs text-[#666] font-mono hover:underline"
              >
                {event.caseNumber}
              </Link>
            )}
          </div>
          <span className="text-xs text-[#999] font-mono shrink-0">
            {format(event.startAt, "MMM d, yyyy")}
          </span>
        </div>
      ))}
    </div>
  );
}
