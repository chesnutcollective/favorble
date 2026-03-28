"use server";

import { db } from "@/db/drizzle";
import { calendarEvents, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Fetch calendar events for a given month range.
 */
export async function getCalendarEventsForMonth(year: number, month: number) {
  const session = await requireSession();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Expand range to cover leading/trailing days in the grid
  const start = new Date(startOfMonth);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(endOfMonth);
  end.setDate(end.getDate() + (6 - end.getDay()));
  end.setHours(23, 59, 59, 999);

  const events = await db
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
        eq(calendarEvents.organizationId, session.organizationId),
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startAt, start),
        lte(calendarEvents.startAt, end),
      ),
    )
    .orderBy(calendarEvents.startAt);

  return events;
}

/**
 * Fetch cases for the "Create Event" dialog case picker.
 */
export async function getCasesForPicker() {
  const session = await requireSession();

  const result = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .orderBy(cases.caseNumber)
    .limit(200);

  return result;
}

/**
 * Create a new calendar event.
 */
export async function createCalendarEvent(data: {
  title: string;
  eventType: "hearing" | "deadline" | "appointment" | "follow_up" | "reminder";
  startAt: string;
  endAt?: string;
  caseId?: string;
  location?: string;
  description?: string;
}) {
  const session = await requireSession();

  const [event] = await db
    .insert(calendarEvents)
    .values({
      organizationId: session.organizationId,
      title: data.title,
      eventType: data.eventType,
      startAt: new Date(data.startAt),
      endAt: data.endAt ? new Date(data.endAt) : null,
      caseId: data.caseId || null,
      location: data.location || null,
      description: data.description || null,
      createdBy: session.id,
    })
    .returning();

  logger.info("Calendar event created", {
    eventId: event.id,
    type: data.eventType,
  });

  revalidatePath("/calendar");
  return event;
}
