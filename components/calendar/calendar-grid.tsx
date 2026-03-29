"use client";

import { useState, useTransition } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  getHours,
  getMinutes,
  differenceInMinutes,
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

type ViewMode = "month" | "week" | "day";

const EVENT_DOT_COLORS: Record<string, string> = {
  hearing: "bg-red-500",
  deadline: "bg-amber-500",
  appointment: "bg-blue-500",
  follow_up: "bg-purple-500",
  reminder: "bg-gray-500",
};

const EVENT_BADGE_COLORS: Record<string, string> = {
  hearing: "bg-red-100 text-red-700",
  deadline: "bg-amber-100 text-amber-700",
  appointment: "bg-blue-100 text-blue-700",
  follow_up: "bg-purple-100 text-purple-700",
  reminder: "bg-muted text-foreground",
};

const EVENT_BLOCK_COLORS: Record<string, string> = {
  hearing: "bg-red-100 border-red-400 text-red-800",
  deadline: "bg-amber-100 border-amber-400 text-amber-800",
  appointment: "bg-blue-100 border-blue-400 text-blue-800",
  follow_up: "bg-purple-100 border-purple-400 text-purple-800",
  reminder: "bg-gray-100 border-gray-400 text-gray-700",
};

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Hours shown in week/day view
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

type Props = {
  initialEvents: CalendarEvent[];
  initialYear: number;
  initialMonth: number;
  onMonthChange: (year: number, month: number) => Promise<CalendarEvent[]>;
  onRangeChange: (
    startDate: string,
    endDate: string,
  ) => Promise<CalendarEvent[]>;
  onCreateEvent: (data: {
    title: string;
    eventType:
      | "hearing"
      | "deadline"
      | "appointment"
      | "follow_up"
      | "reminder";
    startAt: string;
    endAt?: string;
    caseId?: string;
    location?: string;
    description?: string;
  }) => Promise<unknown>;
  onSyncOutlook: () => Promise<{ imported: number; error?: string }>;
  onSendReminder: (
    eventId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  caseOptions: Array<{ id: string; caseNumber: string }>;
  outlookConfigured: boolean;
};

export function CalendarGrid({
  initialEvents,
  initialYear,
  initialMonth,
  onMonthChange,
  onRangeChange,
  onCreateEvent,
  onSyncOutlook,
  onSendReminder,
  caseOptions,
  outlookConfigured,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(
    new Date(initialYear, initialMonth, 1),
  );
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reminderPending, setReminderPending] = useState<string | null>(null);

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

  // Build array of days in the month grid
  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Week view: 7 days starting from the start of the week containing currentDate
  const weekStart = startOfWeek(currentDate);
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) =>
    addDays(weekStart, i),
  );

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
    ? (eventsByDate.get(format(selectedDay, "yyyy-MM-dd")) ?? [])
    : [];

  function refreshEvents(date: Date, mode: ViewMode) {
    startTransition(async () => {
      if (mode === "month") {
        const result = await onMonthChange(date.getFullYear(), date.getMonth());
        setEvents(result);
      } else if (mode === "week") {
        const ws = startOfWeek(date);
        const we = endOfWeek(date);
        const result = await onRangeChange(ws.toISOString(), we.toISOString());
        setEvents(result);
      } else {
        const ds = startOfDay(date);
        const de = endOfDay(date);
        const result = await onRangeChange(ds.toISOString(), de.toISOString());
        setEvents(result);
      }
    });
  }

  function navigate(direction: "prev" | "next") {
    let newDate: Date;
    if (viewMode === "month") {
      newDate =
        direction === "prev"
          ? subMonths(currentDate, 1)
          : addMonths(currentDate, 1);
    } else if (viewMode === "week") {
      newDate =
        direction === "prev"
          ? subWeeks(currentDate, 1)
          : addWeeks(currentDate, 1);
    } else {
      newDate =
        direction === "prev"
          ? addDays(currentDate, -1)
          : addDays(currentDate, 1);
    }
    setCurrentDate(newDate);
    refreshEvents(newDate, viewMode);
  }

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    refreshEvents(currentDate, mode);
  }

  function handleDayClick(clickedDay: Date) {
    if (viewMode === "month") {
      setSelectedDay(
        selectedDay && isSameDay(selectedDay, clickedDay) ? null : clickedDay,
      );
    } else {
      // In week view, clicking a day switches to day view
      setCurrentDate(clickedDay);
      setViewMode("day");
      refreshEvents(clickedDay, "day");
    }
  }

  function openCreateDialog() {
    setNewDate(
      selectedDay
        ? format(selectedDay, "yyyy-MM-dd")
        : format(currentDate, "yyyy-MM-dd"),
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

    // Refresh events
    refreshEvents(currentDate, viewMode);
    setShowCreateDialog(false);
  }

  async function handleSyncOutlook() {
    setSyncMessage(null);
    const result = await onSyncOutlook();
    if (result.error) {
      setSyncMessage(result.error);
    } else {
      setSyncMessage(
        `Imported ${result.imported} event${result.imported !== 1 ? "s" : ""} from Outlook`,
      );
      refreshEvents(currentDate, viewMode);
    }
    setTimeout(() => setSyncMessage(null), 4000);
  }

  async function handleSendReminder(eventId: string) {
    setReminderPending(eventId);
    const result = await onSendReminder(eventId);
    setReminderPending(null);
    if (result.error) {
      // Could show a toast here; for now we just log
      setSyncMessage(result.error);
      setTimeout(() => setSyncMessage(null), 4000);
    } else {
      setSyncMessage("Reminder sent successfully");
      setTimeout(() => setSyncMessage(null), 4000);
    }
  }

  // Get heading text based on view mode
  function getHeading(): string {
    if (viewMode === "month") {
      return format(currentDate, "MMMM yyyy");
    }
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return `${format(ws, "MMM d")} - ${format(we, "MMM d, yyyy")}`;
    }
    return format(currentDate, "EEEE, MMMM d, yyyy");
  }

  return (
    <div className="space-y-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("prev")}>
            &larr; Prev
          </Button>
          <h2 className="text-lg font-semibold text-foreground px-3">
            {getHeading()}
          </h2>
          <Button variant="outline" size="sm" onClick={() => navigate("next")}>
            Next &rarr;
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-border">
            {(["month", "week", "day"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchView(mode)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent"
                } ${mode === "month" ? "rounded-l-md" : ""} ${mode === "day" ? "rounded-r-md" : ""}`}
              >
                {mode}
              </button>
            ))}
          </div>
          {outlookConfigured && (
            <Button variant="outline" size="sm" onClick={handleSyncOutlook}>
              Sync from Outlook
            </Button>
          )}
          <Button size="sm" onClick={openCreateDialog}>
            Create Event
          </Button>
        </div>
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div className="text-sm text-muted-foreground bg-accent/50 rounded-md px-3 py-2">
          {syncMessage}
        </div>
      )}

      {/* ====== MONTH VIEW ====== */}
      {viewMode === "month" && (
        <div className="flex gap-6">
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
                const isSelected = selectedDay
                  ? isSameDay(d, selectedDay)
                  : false;

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

          {/* Side panel -- selected day events */}
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
                        <EventCard
                          key={ev.id}
                          event={ev}
                          onSendReminder={handleSendReminder}
                          reminderPending={reminderPending}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ====== WEEK VIEW ====== */}
      {viewMode === "week" && (
        <div className="overflow-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
              <div />
              {weekDays.map((wd) => (
                <button
                  key={format(wd, "yyyy-MM-dd")}
                  type="button"
                  onClick={() => handleDayClick(wd)}
                  className={`text-center py-2 text-xs font-medium hover:bg-accent/50 transition-colors ${
                    isToday(wd)
                      ? "text-primary font-bold"
                      : "text-muted-foreground"
                  }`}
                >
                  <div>{format(wd, "EEE")}</div>
                  <div
                    className={`text-lg ${isToday(wd) ? "bg-primary text-primary-foreground rounded-full w-8 h-8 inline-flex items-center justify-center" : ""}`}
                  >
                    {format(wd, "d")}
                  </div>
                </button>
              ))}
            </div>

            {/* Hour rows */}
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/50 h-14"
                >
                  <div className="text-xs text-muted-foreground pr-2 text-right pt-0.5">
                    {hour === 12
                      ? "12 PM"
                      : hour > 12
                        ? `${hour - 12} PM`
                        : `${hour} AM`}
                  </div>
                  {weekDays.map((wd) => {
                    const dateKey = format(wd, "yyyy-MM-dd");
                    const dayEvents = eventsByDate.get(dateKey) ?? [];
                    const hourEvents = dayEvents.filter((ev) => {
                      const h = getHours(new Date(ev.startAt));
                      return h === hour;
                    });

                    return (
                      <div
                        key={`${dateKey}-${hour}`}
                        className="border-l border-border/30 relative"
                      >
                        {hourEvents.map((ev) => {
                          const evStart = new Date(ev.startAt);
                          const evEnd = ev.endAt
                            ? new Date(ev.endAt)
                            : new Date(evStart.getTime() + 60 * 60 * 1000);
                          const topOffset = (getMinutes(evStart) / 60) * 100;
                          const duration = Math.max(
                            differenceInMinutes(evEnd, evStart),
                            30,
                          );
                          const heightPct = (duration / 60) * 100;

                          return (
                            <div
                              key={ev.id}
                              className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] leading-tight border-l-2 overflow-hidden cursor-default ${
                                EVENT_BLOCK_COLORS[ev.eventType] ??
                                "bg-gray-100 border-gray-400 text-gray-700"
                              }`}
                              style={{
                                top: `${topOffset}%`,
                                height: `${Math.min(heightPct, 200)}%`,
                                minHeight: "20px",
                              }}
                              title={`${ev.title} - ${format(evStart, "h:mm a")}`}
                            >
                              <span className="font-medium truncate block">
                                {ev.title}
                              </span>
                              <span className="opacity-70">
                                {format(evStart, "h:mm a")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====== DAY VIEW ====== */}
      {viewMode === "day" && (
        <div className="flex gap-6">
          <div className="flex-1">
            {HOURS.map((hour) => {
              const dateKey = format(currentDate, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const hourEvents = dayEvents.filter((ev) => {
                const h = getHours(new Date(ev.startAt));
                return h === hour;
              });

              return (
                <div
                  key={hour}
                  className="flex border-b border-border/50 min-h-[60px]"
                >
                  <div className="w-16 shrink-0 text-xs text-muted-foreground text-right pr-3 pt-1">
                    {hour === 12
                      ? "12 PM"
                      : hour > 12
                        ? `${hour - 12} PM`
                        : `${hour} AM`}
                  </div>
                  <div className="flex-1 relative py-0.5">
                    {hourEvents.map((ev) => {
                      const evStart = new Date(ev.startAt);
                      const evEnd = ev.endAt
                        ? new Date(ev.endAt)
                        : new Date(evStart.getTime() + 60 * 60 * 1000);
                      const duration = Math.max(
                        differenceInMinutes(evEnd, evStart),
                        30,
                      );

                      return (
                        <div
                          key={ev.id}
                          className={`rounded-md px-3 py-2 mb-1 border-l-4 ${
                            EVENT_BLOCK_COLORS[ev.eventType] ??
                            "bg-gray-100 border-gray-400 text-gray-700"
                          }`}
                          style={{
                            minHeight: `${Math.max((duration / 60) * 56, 28)}px`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {ev.title}
                            </span>
                            <Badge
                              className={`text-[10px] ${EVENT_BADGE_COLORS[ev.eventType] ?? ""}`}
                            >
                              {ev.eventType.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="text-xs opacity-70 mt-0.5">
                            {format(evStart, "h:mm a")}
                            {ev.endAt &&
                              ` - ${format(new Date(ev.endAt), "h:mm a")}`}
                          </div>
                          {ev.location && (
                            <div className="text-xs opacity-60 mt-0.5">
                              {ev.location}
                            </div>
                          )}
                          {ev.caseId && ev.caseNumber && (
                            <Link
                              href={`/cases/${ev.caseId}/calendar`}
                              className="text-xs text-primary hover:underline mt-0.5 inline-block"
                            >
                              Case #{ev.caseNumber}
                            </Link>
                          )}
                          {ev.eventType === "hearing" && ev.caseId && (
                            <div className="mt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                disabled={reminderPending === ev.id}
                                onClick={() => handleSendReminder(ev.id)}
                              >
                                {reminderPending === ev.id
                                  ? "Sending..."
                                  : "Send Reminder"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day view side panel with all events for the day */}
          <div className="w-80 shrink-0">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">
                  Events for {format(currentDate, "MMMM d")}
                </h3>
                {(() => {
                  const dateKey = format(currentDate, "yyyy-MM-dd");
                  const dayEvts = eventsByDate.get(dateKey) ?? [];
                  if (dayEvts.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        No events on this day.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {dayEvts.map((ev) => (
                        <EventCard
                          key={ev.id}
                          event={ev}
                          onSendReminder={handleSendReminder}
                          reminderPending={reminderPending}
                        />
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
                      setNewType(e.target.value as typeof newType)
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

/** Shared event card used in side panels */
function EventCard({
  event,
  onSendReminder,
  reminderPending,
}: {
  event: CalendarEvent;
  onSendReminder: (id: string) => void;
  reminderPending: string | null;
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center gap-2 mb-1">
        <Badge
          className={`text-xs ${EVENT_BADGE_COLORS[event.eventType] ?? ""}`}
        >
          {event.eventType.replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="text-sm font-medium text-foreground">{event.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {new Date(event.startAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
        {event.endAt &&
          ` - ${new Date(event.endAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}`}
      </p>
      {event.description && (
        <p className="text-xs text-muted-foreground mt-1">
          {event.description}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
        {event.caseId && event.caseNumber && (
          <Link
            href={`/cases/${event.caseId}/calendar`}
            className="text-primary hover:underline"
          >
            Case #{event.caseNumber}
          </Link>
        )}
        {event.location && <span>{event.location}</span>}
        {event.hearingOffice && <span>Office: {event.hearingOffice}</span>}
        {event.adminLawJudge && <span>ALJ: {event.adminLawJudge}</span>}
      </div>
      {event.eventType === "hearing" && event.caseId && (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            disabled={reminderPending === event.id}
            onClick={() => onSendReminder(event.id)}
          >
            {reminderPending === event.id ? "Sending..." : "Send Reminder"}
          </Button>
        </div>
      )}
    </div>
  );
}
