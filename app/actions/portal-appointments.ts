"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { calendarEvents } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { logger } from "@/lib/logger/server";
import { PORTAL_IMPERSONATE_COOKIE } from "@/app/(client)/layout";
import { sendPortalMessage } from "@/app/actions/portal-messages";

async function getSession() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  return ensurePortalSession({ impersonateContactId });
}

export type PortalAppointmentRow = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  eventType: string;
  clientDescription: string | null;
  clientLocationText: string | null;
  attendanceRequired: boolean;
  clientConfirmedAt: string | null;
  caseId: string | null;
};

/**
 * Load every portal-visible calendar event tied to the active session's cases.
 * Ordered by `startAt` ascending; the page component splits into upcoming
 * vs. past for rendering.
 */
export async function loadPortalAppointments(): Promise<
  PortalAppointmentRow[]
> {
  const session = await getSession();
  const sessionCaseIds = session.cases.map((c) => c.id);
  if (sessionCaseIds.length === 0) return [];

  try {
    const rows = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        eventType: calendarEvents.eventType,
        description: calendarEvents.description,
        location: calendarEvents.location,
        clientDescription: calendarEvents.clientDescription,
        clientLocationText: calendarEvents.clientLocationText,
        attendanceRequired: calendarEvents.attendanceRequired,
        clientConfirmedAt: calendarEvents.clientConfirmedAt,
        caseId: calendarEvents.caseId,
      })
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.caseId, sessionCaseIds),
          eq(calendarEvents.visibleToClient, true),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .orderBy(asc(calendarEvents.startAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt ? r.endAt.toISOString() : null,
      eventType: r.eventType,
      // Prefer staff-authored client strings, fall back to the internal fields
      clientDescription: r.clientDescription ?? r.description ?? null,
      clientLocationText: r.clientLocationText ?? r.location ?? null,
      attendanceRequired: r.attendanceRequired,
      clientConfirmedAt: r.clientConfirmedAt
        ? r.clientConfirmedAt.toISOString()
        : null,
      caseId: r.caseId,
    }));
  } catch (error) {
    logger.error("portal: failed to load appointments", {
      portalUserId: session.portalUser.id,
      error,
    });
    return [];
  }
}

/**
 * Client-side confirmation of an appointment. Writes clientConfirmedAt +
 * clientConfirmedBy so staff can see the claimant acknowledged it.
 */
export async function confirmAppointment(
  eventId: string,
): Promise<
  { ok: true; confirmedAt: string } | { ok: false; error: string }
> {
  const session = await getSession();

  if (session.isImpersonating) {
    return {
      ok: false,
      error: "Cannot confirm appointments while previewing the portal.",
    };
  }

  const sessionCaseIds = session.cases.map((c) => c.id);
  if (sessionCaseIds.length === 0) {
    return { ok: false, error: "No active case is linked to your account." };
  }

  try {
    // Verify the event belongs to one of this session's cases AND is
    // visible to the client — otherwise bail. We do the lookup in a
    // single roundtrip via the update filter.
    const now = new Date();
    const [row] = await db
      .update(calendarEvents)
      .set({
        clientConfirmedAt: now,
        clientConfirmedBy: session.portalUser.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(calendarEvents.id, eventId),
          inArray(calendarEvents.caseId, sessionCaseIds),
          eq(calendarEvents.visibleToClient, true),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .returning({ id: calendarEvents.id, caseId: calendarEvents.caseId });

    if (!row) {
      return { ok: false, error: "Appointment not found." };
    }

    await logPortalActivity("confirm_appointment", "calendar_event", row.id, {
      caseId: row.caseId,
    });

    revalidatePath("/portal/appointments");
    if (row.caseId) {
      revalidatePath(`/cases/${row.caseId}/calendar`);
    }

    return { ok: true, confirmedAt: now.toISOString() };
  } catch (error) {
    logger.error("portal: failed to confirm appointment", {
      eventId,
      portalUserId: session.portalUser.id,
      error,
    });
    return {
      ok: false,
      error: "We couldn't confirm this appointment. Please try again.",
    };
  }
}

/**
 * Records a "view_appointment" event when the claimant opens a detail card
 * or expands the list. Called from the client component on mount.
 */
export async function logAppointmentView(eventId: string): Promise<void> {
  await logPortalActivity("view_appointment", "calendar_event", eventId);
}

/**
 * Sends a reschedule request to the firm by posting a message through the
 * portal-messages pipeline. The body is pre-filled by the caller (dialog).
 */
export async function requestReschedule(input: {
  eventId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (session.isImpersonating) {
    return {
      ok: false,
      error: "Cannot request changes while previewing the portal.",
    };
  }

  const result = await sendPortalMessage({ body: input.body });
  if (!result.ok) return result;

  await logPortalActivity("request_reschedule", "calendar_event", input.eventId);
  return { ok: true };
}

export type CallbackTimeWindow =
  | "morning"
  | "afternoon"
  | "evening"
  | "no_preference";

const CALLBACK_WINDOW_LABELS: Record<CallbackTimeWindow, string> = {
  morning: "Morning (before noon)",
  afternoon: "Afternoon (noon–5pm)",
  evening: "Evening (after 5pm)",
  no_preference: "No preference",
};

const MAX_CALLBACK_REASON_LENGTH = 500;

/**
 * Claimant requests a callback from their firm. We don't have a dedicated
 * callback_requests table yet, so we piggyback on the portal-messages
 * pipeline: a structured inbound message lands in the firm's inbox, clearly
 * flagged so staff can route it to the right person.
 */
export async function requestCallback(input: {
  window: CallbackTimeWindow;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (session.isImpersonating) {
    return {
      ok: false,
      error: "Cannot request a callback while previewing the portal.",
    };
  }

  const reason = (input.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "Please tell us what you'd like to discuss." };
  }
  if (reason.length > MAX_CALLBACK_REASON_LENGTH) {
    return {
      ok: false,
      error: `Reason is too long (max ${MAX_CALLBACK_REASON_LENGTH} characters).`,
    };
  }

  const windowLabel =
    CALLBACK_WINDOW_LABELS[input.window] ??
    CALLBACK_WINDOW_LABELS.no_preference;

  const body = `📞 Callback requested — Preferred: ${windowLabel}. Reason: ${reason}`;

  const result = await sendPortalMessage({ body });
  if (!result.ok) return result;

  await logPortalActivity("request_callback", "communication", result.id, {
    window: input.window,
  });

  return { ok: true };
}
