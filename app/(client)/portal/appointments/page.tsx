import { cookies } from "next/headers";
import { CalendarDays } from "lucide-react";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import {
  confirmAppointment,
  loadPortalAppointments,
  requestReschedule,
  type PortalAppointmentRow,
} from "@/app/actions/portal-appointments";
import { AppointmentCard } from "@/components/portal/appointment-card";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";

/**
 * B5 — Client-visible appointments page.
 *
 * Pulls calendar events tied to any of the session's cases where
 * `visibleToClient = true`, ordered ascending. The list is split into an
 * "Upcoming" bucket (startAt ≥ now) and a "Past" bucket so claimants can
 * tell at a glance what to prep for.
 */
export default async function PortalAppointmentsPage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  await ensurePortalSession({ impersonateContactId });

  const [, appointments] = await Promise.all([
    logPortalActivity("view_appointments"),
    loadPortalAppointments(),
  ]);

  const now = Date.now();
  const upcoming: PortalAppointmentRow[] = [];
  const past: PortalAppointmentRow[] = [];
  for (const appt of appointments) {
    if (new Date(appt.startAt).getTime() >= now) {
      upcoming.push(appt);
    } else {
      past.push(appt);
    }
  }
  // Past should show most-recent first
  past.reverse();

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-[#104e60]/10 text-[#104e60]">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">
              Appointments
            </h1>
            <p className="mt-0.5 text-[15px] text-foreground/70">
              Hearings, calls, and check-ins your team has shared with you.
            </p>
          </div>
        </div>
      </header>

      {appointments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="upcoming-heading"
                className="text-[15px] font-semibold uppercase tracking-wide text-foreground/60"
              >
                Upcoming
              </h2>
              <span className="text-[13px] text-foreground/50">
                {upcoming.length}{" "}
                {upcoming.length === 1 ? "appointment" : "appointments"}
              </span>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-[15px] text-foreground/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
                No upcoming appointments scheduled.
              </p>
            ) : (
              upcoming.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  variant="upcoming"
                  confirmAction={confirmAppointment}
                  rescheduleAction={requestReschedule}
                />
              ))
            )}
          </section>

          {past.length > 0 ? (
            <section aria-labelledby="past-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="past-heading"
                  className="text-[15px] font-semibold uppercase tracking-wide text-foreground/60"
                >
                  Past
                </h2>
                <span className="text-[13px] text-foreground/50">
                  {past.length}{" "}
                  {past.length === 1 ? "appointment" : "appointments"}
                </span>
              </div>
              {past.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  variant="past"
                  confirmAction={confirmAppointment}
                  rescheduleAction={requestReschedule}
                />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#104e60]/10 text-[#104e60]">
        <CalendarDays className="size-6" />
      </span>
      <h2 className="mt-3 text-[17px] font-semibold text-foreground">
        No appointments yet
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-foreground/60">
        When your team schedules a hearing, call, or check-in for you,
        you&apos;ll see it here.
      </p>
    </div>
  );
}
