"use client";

import { useState, useTransition } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  startAt: string; // ISO string from serialization
  endAt: string | null;
  location: string | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
  caseId: string | null;
  caseNumber: string | null;
};

const EVENT_DOT_COLORS: Record<string, string> = {
  hearing: "bg-red-500",
  deadline: "bg-amber-500",
  appointment: "bg-blue-500",
  follow_up: "bg-green-500",
  reminder: "bg-gray-500",
};

const EVENT_BADGE_COLORS: Record<string, string> = {
  hearing: "bg-red-100 text-red-700",
  deadline: "bg-amber-100 text-amber-700",
  appointment: "bg-blue-100 text-blue-700",
  follow_up: "bg-green-100 text-green-700",
  reminder: "bg-muted text-foreground",
};

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  initialEvents: CalendarEvent[];
  initialYear: number;
  initialMonth: number;
  onMonthChange: (year: number, month: number) => Promise<CalendarEvent[]>;
  onCreateEvent: (data: {
    title: string;
    eventType: "hearing" | "deadline" | "appointment" | "follow_up" | "reminder";
    startAt: string;
    endAt?: string;
    caseId?: string;
    location?: string;
    description?: string;
  }) => Promise<unknown>;
  caseOptions: Array<{ id: string; caseNumber: string }>;
};

export function CalendarGrid({
  initialEvents,
  initialYear,
  initialMonth,
  onMonthChange,
  onCreateEvent,
  caseOptions,
}: Props) {
  const [currentDate, setCurrentDate] = useState(
    new Date(initialYear, initialMonth, 1),
  );
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create event form state
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<
    "hearing" | "deadline" | "appointment" | "follow_up" | "reminder"
  >("appointment");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newCaseId, setNewCaseId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  // Build array of days in the grid
  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Build event map by date key
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const dateKey = format(new Date(event.startAt), "yyyy-MM-dd");
    const existing = eventsByDate.get(dateKey) ?? [];
    existing.push(event);
    eventsByDate.set(dateKey, existing);
  }

  // Events for the selected day
  const selectedDayEvents = selectedDay
    ? eventsByDate.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];

  function navigateMonth(direction: "prev" | "next") {
    const newDate =
      direction === "prev"
        ? subMonths(currentDate, 1)
        : addMonths(currentDate, 1);
    setCurrentDate(newDate);
    startTransition(async () => {
      const result = await onMonthChange(
        newDate.getFullYear(),
        newDate.getMonth(),
      );
      setEvents(result);
    });
  }

  function handleDayClick(clickedDay: Date) {
    setSelectedDay(
      selectedDay && isSameDay(selectedDay, clickedDay)
        ? null
        : clickedDay,
    );
  }

  function openCreateDialog() {
    setNewDate(
      selectedDay
        ? format(selectedDay, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
    );
    setNewTitle("");
    setNewType("appointment");
    setNewTime("09:00");
    setNewCaseId("");
    setNewLocation("");
    setNewNotes("");
    setShowCreateDialog(true);
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle || !newDate) return;

    const startAt = new Date(`${newDate}T${newTime}`).toISOString();

    await onCreateEvent({
      title: newTitle,
      eventType: newType,
      startAt,
      caseId: newCaseId || undefined,
      location: newLocation || undefined,
      description: newNotes || undefined,
    });

    // Refresh events for current month
    const result = await onMonthChange(
      currentDate.getFullYear(),
      currentDate.getMonth(),
    );
    setEvents(result);
    setShowCreateDialog(false);
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateMonth("prev")}>
            &larr; Prev
          </Button>
          <h2 className="text-lg font-semibold text-foreground px-3">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <Button variant="outline" size="sm" onClick={() => navigateMonth("next")}>
            Next &rarr;
          </Button>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          Create Event
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1">
          <div className="grid grid-cols-7 border-b border-border mb-1">
            {DAY_HEADERS.map((h) => (
              <div
                key={h}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((d) => {
              const dateKey = format(d, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const inMonth = isSameMonth(d, currentDate);
              const today = isToday(d);
              const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => handleDayClick(d)}
                  className={`
                    bg-background p-1.5 min-h-[72px] text-left transition-colors
                    hover:bg-accent/50
                    ${!inMonth ? "opacity-40" : ""}
                    ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                  `}
                >
                  <span
                    className={`
                      text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full
                      ${today ? "bg-primary text-primary-foreground" : "text-foreground"}
                    `}
                  >
                    {format(d, "d")}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className={`h-1.5 w-1.5 rounded-full ${EVENT_DOT_COLORS[ev.eventType] ?? "bg-gray-500"}`}
                          title={ev.title}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-muted-foreground ml-0.5">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(EVENT_DOT_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${color}`} />
                <span className="text-xs text-muted-foreground capitalize">
                  {type.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Side panel — selected day events */}
        {selectedDay && (
          <div className="w-80 shrink-0">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">
                  {format(selectedDay, "EEEE, MMMM d, yyyy")}
                </h3>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No events on this day.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="border border-border rounded-md p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            className={`text-xs ${EVENT_BADGE_COLORS[ev.eventType] ?? ""}`}
                          >
                            {ev.eventType.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {ev.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(ev.startAt).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {ev.endAt &&
                            ` - ${new Date(ev.endAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}`}
                        </p>
                        {ev.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {ev.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          {ev.caseId && ev.caseNumber && (
                            <Link
                              href={`/cases/${ev.caseId}/calendar`}
                              className="text-primary hover:underline"
                            >
                              Case #{ev.caseNumber}
                            </Link>
                          )}
                          {ev.location && <span>{ev.location}</span>}
                          {ev.hearingOffice && (
                            <span>Office: {ev.hearingOffice}</span>
                          )}
                          {ev.adminLawJudge && (
                            <span>ALJ: {ev.adminLawJudge}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Create Event Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/80"
            onClick={() => setShowCreateDialog(false)}
            onKeyDown={() => {}}
          />
          <div className="relative z-50 w-full max-w-lg bg-background border border-border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Create Event
            </h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="evt-title" className="text-sm font-medium">
                  Title
                </label>
                <input
                  id="evt-title"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Event title"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="evt-type" className="text-sm font-medium">
                    Type
                  </label>
                  <select
                    id="evt-type"
                    value={newType}
                    onChange={(e) =>
                      setNewType(
                        e.target.value as typeof newType,
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="hearing">Hearing</option>
                    <option value="deadline">Deadline</option>
                    <option value="appointment">Appointment</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="reminder">Reminder</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="evt-case" className="text-sm font-medium">
                    Case
                  </label>
                  <select
                    id="evt-case"
                    value={newCaseId}
                    onChange={(e) => setNewCaseId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">None</option>
                    {caseOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.caseNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="evt-date" className="text-sm font-medium">
                    Date
                  </label>
                  <input
                    id="evt-date"
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="evt-time" className="text-sm font-medium">
                    Time
                  </label>
                  <input
                    id="evt-time"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="evt-location" className="text-sm font-medium">
                  Location
                </label>
                <input
                  id="evt-location"
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Optional location"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="evt-notes" className="text-sm font-medium">
                  Notes
                </label>
                <textarea
                  id="evt-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPending && (
        <div className="text-center text-sm text-muted-foreground">
          Loading events...
        </div>
      )}
    </div>
  );
}
