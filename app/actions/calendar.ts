"use server";

import { db } from "@/db/drizzle";
import { calendarEvents, cases, communications } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, gte, lte, isNull, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import * as outlook from "@/lib/integrations/outlook";
import * as caseStatus from "@/lib/integrations/case-status";

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

  // If Outlook is configured, create the event there too
  let outlookEventId: string | null = null;
  if (outlook.isConfigured()) {
    try {
      const startDate = new Date(data.startAt);
      const endDate = data.endAt
        ? new Date(data.endAt)
        : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1h
      const result = await outlook.createCalendarEvent(session.email, {
        subject: data.title,
        body: data.description,
        startAt: startDate,
        endAt: endDate,
        location: data.location,
      });
      if (result) {
        outlookEventId = result.outlookEventId;
        await db
          .update(calendarEvents)
          .set({ outlookEventId })
          .where(eq(calendarEvents.id, event.id));
      }
    } catch (err) {
      logger.error("Outlook sync failed during event creation", { error: err });
    }
  }

  logger.info("Calendar event created", {
    eventId: event.id,
    type: data.eventType,
    outlookEventId,
  });

  revalidatePath("/calendar");
  return event;
}

/**
 * Fetch events from Outlook and import them into the app.
 * Returns the count of newly imported events.
 */
export async function syncFromOutlook(): Promise<{
  imported: number;
  error?: string;
}> {
  const session = await requireSession();

  if (!outlook.isConfigured()) {
    return { imported: 0, error: "Outlook integration is not configured" };
  }

  try {
    const token = await getOutlookAccessToken();
    if (!token) {
      return { imported: 0, error: "Could not obtain Outlook access token" };
    }

    // Fetch events from Outlook for the next 90 days
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${session.email}/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=100&$orderby=start/dateTime`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      logger.error("Outlook calendar fetch failed", {
        status: response.status,
      });
      return { imported: 0, error: "Failed to fetch events from Outlook" };
    }

    const data = await response.json();
    const outlookEvents: Array<{
      id: string;
      subject: string;
      bodyPreview: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      location: { displayName?: string };
      isAllDay: boolean;
    }> = data.value ?? [];

    // Get existing outlook event IDs to avoid duplicates
    const existingEvents = await db
      .select({ outlookEventId: calendarEvents.outlookEventId })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, session.organizationId),
          isNull(calendarEvents.deletedAt),
        ),
      );

    const existingIds = new Set(
      existingEvents
        .map((e) => e.outlookEventId)
        .filter((id): id is string => id !== null),
    );

    let imported = 0;
    for (const oe of outlookEvents) {
      if (existingIds.has(oe.id)) continue;

      await db.insert(calendarEvents).values({
        organizationId: session.organizationId,
        title: oe.subject || "Outlook Event",
        description: oe.bodyPreview || null,
        eventType: "appointment",
        startAt: new Date(oe.start.dateTime + "Z"),
        endAt: new Date(oe.end.dateTime + "Z"),
        allDay: oe.isAllDay,
        location: oe.location?.displayName || null,
        outlookEventId: oe.id,
        createdBy: session.id,
      });
      imported++;
    }

    logger.info("Outlook sync completed", { imported });
    revalidatePath("/calendar");
    return { imported };
  } catch (error) {
    logger.error("Outlook sync error", { error });
    return { imported: 0, error: "An unexpected error occurred during sync" };
  }
}

/** Helper to get Outlook access token (reuses the outlook module's auth flow). */
async function getOutlookAccessToken(): Promise<string | null> {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    if (!clientId || !clientSecret || !tenantId) return null;

    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Send a hearing reminder to the client via Case Status.
 */
export async function sendHearingReminder(eventId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const session = await requireSession();

  // Fetch the event with its linked case
  const [event] = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      location: calendarEvents.location,
      hearingOffice: calendarEvents.hearingOffice,
      caseId: calendarEvents.caseId,
      reminderSent: calendarEvents.reminderSent,
      caseStatusExternalId: cases.caseStatusExternalId,
      caseNumber: cases.caseNumber,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
    .where(
      and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.organizationId, session.organizationId),
        isNull(calendarEvents.deletedAt),
      ),
    );

  if (!event) {
    return { success: false, error: "Event not found" };
  }

  if (!event.caseId) {
    return { success: false, error: "Event is not linked to a case" };
  }

  // Build the reminder message
  const dateStr = event.startAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = event.startAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const locationStr = event.hearingOffice || event.location || "";
  const message = `Reminder: You have an upcoming hearing "${event.title}" on ${dateStr} at ${timeStr}${locationStr ? ` at ${locationStr}` : ""}. Please contact the office if you have any questions.`;

  // Try sending via Case Status if configured and the case has an external ID
  if (caseStatus.isConfigured() && event.caseStatusExternalId) {
    const senderName = `${session.firstName} ${session.lastName}`;
    const result = await caseStatus.sendMessage(
      event.caseStatusExternalId,
      message,
      senderName,
    );
    if (!result.success) {
      return {
        success: false,
        error: "Failed to send reminder via Case Status",
      };
    }
  }

  // Record the communication
  await db.insert(communications).values({
    organizationId: session.organizationId,
    caseId: event.caseId,
    type: "message_outbound",
    direction: "outbound",
    subject: `Hearing Reminder: ${event.title}`,
    body: message,
    sourceSystem: "caseflow",
    userId: session.id,
  });

  // Mark reminder as sent
  await db
    .update(calendarEvents)
    .set({ reminderSent: true })
    .where(eq(calendarEvents.id, eventId));

  logger.info("Hearing reminder sent", { eventId, caseId: event.caseId });
  revalidatePath("/calendar");
  return { success: true };
}

/**
 * Fetch upcoming events for the dashboard widget.
 * Returns the next N events from today forward.
 */
export async function getUpcomingEvents(limit = 5) {
  const session = await requireSession();
  const now = new Date();

  const events = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      caseId: calendarEvents.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
    .where(
      and(
        eq(calendarEvents.organizationId, session.organizationId),
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startAt, now),
      ),
    )
    .orderBy(asc(calendarEvents.startAt))
    .limit(limit);

  return events;
}

/**
 * Fetch events for a specific date range (used by week/day views).
 */
export async function getCalendarEventsForRange(
  startDate: string,
  endDate: string,
) {
  const session = await requireSession();

  const start = new Date(startDate);
  const end = new Date(endDate);

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
