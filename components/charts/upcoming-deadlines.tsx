"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { format, isPast, isToday } from "date-fns";
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
      <p className="text-[13px] text-[#999] py-4 text-center">
        No upcoming deadlines
      </p>
    );
  }

  return (
    <ul className="list-none">
      {events.map((event) => {
        const overdue = isPast(event.startAt) && !isToday(event.startAt);

        return (
          <li
            key={event.id}
            className="flex items-center gap-3 py-3 border-b border-[#EAEAEA] last:border-b-0 text-[13px]"
          >
            <Checkbox className="h-4 w-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-[#171717]">
              {event.title}
              {event.caseId && event.caseNumber && (
                <>
                  {" \u2014 "}
                  <Link
                    href={`/cases/${event.caseId}`}
                    className="text-[#666] font-mono text-[11px] hover:underline"
                  >
                    {event.caseNumber}
                  </Link>
                </>
              )}
            </span>
            <span
              className={`text-[11px] font-mono shrink-0 ${
                overdue ? "text-[#EE0000]" : "text-[#666]"
              }`}
            >
              {format(event.startAt, "MMM d")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
