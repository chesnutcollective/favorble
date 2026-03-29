import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getCalendarEventsForMonth,
  getCalendarEventsForRange,
  getCasesForPicker,
  createCalendarEvent,
  syncFromOutlook,
  sendHearingReminder,
} from "@/app/actions/calendar";
import { isConfigured as isOutlookConfigured } from "@/lib/integrations/outlook";
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

async function fetchRangeEvents(startDate: string, endDate: string) {
  "use server";
  const events = await getCalendarEventsForRange(startDate, endDate);
  return events.map((ev) => ({
    ...ev,
    startAt: ev.startAt.toISOString(),
    endAt: ev.endAt?.toISOString() ?? null,
  }));
}

async function handleSyncOutlook() {
  "use server";
  return syncFromOutlook();
}

async function handleSendReminder(eventId: string) {
  "use server";
  return sendHearingReminder(eventId);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireSession();
  const { date: initialDateParam } = await searchParams;

  // If a date param is provided (YYYY-MM-DD), use that; otherwise default to today
  const parsedDate = initialDateParam ? new Date(initialDateParam) : null;
  const now =
    parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let events: Awaited<ReturnType<typeof fetchMonthEvents>> = [];
  let caseOptions: Awaited<ReturnType<typeof getCasesForPicker>> = [];
  let outlookConfigured = false;

  try {
    [events, caseOptions] = await Promise.all([
      fetchMonthEvents(year, month),
      getCasesForPicker(),
    ]);
    outlookConfigured = isOutlookConfigured();
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
        onRangeChange={fetchRangeEvents}
        onCreateEvent={createCalendarEvent}
        onSyncOutlook={handleSyncOutlook}
        onSendReminder={handleSendReminder}
        caseOptions={caseOptions}
        outlookConfigured={outlookConfigured}
        initialDay={parsedDate ? now.getDate() : undefined}
      />
    </div>
  );
}
