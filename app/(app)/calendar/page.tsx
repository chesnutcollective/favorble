import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getCalendarEventsForMonth,
  getCasesForPicker,
  createCalendarEvent,
} from "@/app/actions/calendar";
import { PageHeader } from "@/components/shared/page-header";
import { CalendarGrid } from "@/components/calendar/calendar-grid";

export const metadata: Metadata = {
  title: "Calendar",
};

async function fetchMonthEvents(year: number, month: number) {
  "use server";
  const events = await getCalendarEventsForMonth(year, month);
  // Serialize dates to ISO strings for the client
  return events.map((ev) => ({
    ...ev,
    startAt: ev.startAt.toISOString(),
    endAt: ev.endAt?.toISOString() ?? null,
  }));
}

export default async function CalendarPage() {
  await requireSession();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let events: Awaited<ReturnType<typeof fetchMonthEvents>> = [];
  let caseOptions: Awaited<ReturnType<typeof getCasesForPicker>> = [];

  try {
    [events, caseOptions] = await Promise.all([
      fetchMonthEvents(year, month),
      getCasesForPicker(),
    ]);
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Hearings, deadlines, and appointments."
      />

      <CalendarGrid
        initialEvents={events}
        initialYear={year}
        initialMonth={month}
        onMonthChange={fetchMonthEvents}
        onCreateEvent={createCalendarEvent}
        caseOptions={caseOptions}
      />
    </div>
  );
}
