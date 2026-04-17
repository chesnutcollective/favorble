"use client";

import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquareWarning,
} from "lucide-react";
import { useState, useTransition } from "react";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import type { PortalAppointmentRow } from "@/app/actions/portal-appointments";

type ActionResult = { ok: true } | { ok: false; error: string };

type ConfirmAction = (
  eventId: string,
) => Promise<
  { ok: true; confirmedAt: string } | { ok: false; error: string }
>;

type RescheduleAction = (input: {
  eventId: string;
  body: string;
}) => Promise<ActionResult>;

type Props = {
  appointment: PortalAppointmentRow;
  variant: "upcoming" | "past";
  confirmAction: ConfirmAction;
  rescheduleAction: RescheduleAction;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWeekdayLong(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Build an RFC 5545 .ics payload for a single appointment and trigger a
 * browser download. Keeps the implementation local so we don't pull in
 * an extra dependency.
 */
function triggerIcsDownload(appointment: PortalAppointmentRow) {
  const start = new Date(appointment.startAt);
  const end = appointment.endAt
    ? new Date(appointment.endAt)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const stamp = (d: Date): string =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  const escape = (value: string | null | undefined): string =>
    (value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Favorble//Client Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:favorble-${appointment.id}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(appointment.title)}`,
    appointment.clientDescription
      ? `DESCRIPTION:${escape(appointment.clientDescription)}`
      : null,
    appointment.clientLocationText
      ? `LOCATION:${escape(appointment.clientLocationText)}`
      : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `favorble-${appointment.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AppointmentCard({
  appointment,
  variant,
  confirmAction,
  rescheduleAction,
}: Props) {
  const { isImpersonating } = usePortalImpersonation();
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    appointment.clientConfirmedAt,
  );
  const [error, setError] = useState<string | null>(null);
  const [isConfirmPending, startConfirm] = useTransition();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const start = new Date(appointment.startAt);
  const day = start.getDate();
  const month = MONTHS[start.getMonth()];
  const year = start.getFullYear();
  const isPast = variant === "past";

  function handleConfirm() {
    if (isImpersonating || isConfirmPending) return;
    setError(null);
    startConfirm(async () => {
      const res = await confirmAction(appointment.id);
      if (!res.ok) {
        setError(res.error);
      } else {
        setConfirmedAt(res.confirmedAt);
      }
    });
  }

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-5 ${
        isPast ? "opacity-80" : ""
      }`}
    >
      <div className="flex gap-4">
        <DateChip day={day} month={month} year={year} isPast={isPast} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground/60">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatTime(appointment.startAt)}
              {appointment.endAt
                ? ` – ${formatTime(appointment.endAt)}`
                : null}
            </span>
            <span className="text-[13px] text-foreground/40">·</span>
            <span className="text-[13px] font-medium capitalize text-foreground/60">
              {appointment.eventType.replace(/_/g, " ")}
            </span>
            {appointment.attendanceRequired ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-900">
                <AlertTriangle className="size-3" aria-hidden="true" />
                Attendance required
              </span>
            ) : null}
            {confirmedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-semibold text-emerald-900">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Confirmed
              </span>
            ) : null}
          </div>

          <h3 className="text-[17px] font-semibold text-foreground">
            {appointment.title}
          </h3>

          {appointment.clientLocationText ? (
            <p className="flex items-start gap-2 text-[15px] text-foreground/70">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{appointment.clientLocationText}</span>
            </p>
          ) : null}

          {appointment.clientDescription ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">
              {appointment.clientDescription}
            </p>
          ) : null}

          <p className="text-[13px] text-foreground/50">
            {formatWeekdayLong(appointment.startAt)}
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {!isPast ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8E2D8] pt-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={
              isImpersonating || isConfirmPending || Boolean(confirmedAt)
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-[#104e60] px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {confirmedAt ? "Confirmed" : isConfirmPending ? "Confirming..." : "Confirm"}
          </button>

          <button
            type="button"
            onClick={() => setRescheduleOpen(true)}
            disabled={isImpersonating}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessageSquareWarning className="size-4" aria-hidden="true" />
            Request reschedule
          </button>

          <button
            type="button"
            onClick={() => triggerIcsDownload(appointment)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC]"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Add to calendar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8E2D8] pt-3">
          <button
            type="button"
            onClick={() => triggerIcsDownload(appointment)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC]"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Add to calendar
          </button>
        </div>
      )}

      {rescheduleOpen ? (
        <RescheduleDialog
          appointment={appointment}
          onClose={() => setRescheduleOpen(false)}
          rescheduleAction={rescheduleAction}
        />
      ) : null}
    </article>
  );
}

function DateChip({
  day,
  month,
  year,
  isPast,
}: {
  day: number;
  month: string;
  year: number;
  isPast: boolean;
}) {
  return (
    <div
      className={`flex size-[64px] shrink-0 flex-col items-center justify-center rounded-2xl text-center sm:size-[72px] ${
        isPast ? "bg-[#F2EEE5] text-foreground/60" : "bg-[#104e60] text-white"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
        {month}
      </span>
      <span className="text-[24px] font-bold leading-none sm:text-[28px]">
        {day}
      </span>
      <span className="text-[10px] opacity-70">{year}</span>
    </div>
  );
}

function RescheduleDialog({
  appointment,
  onClose,
  rescheduleAction,
}: {
  appointment: PortalAppointmentRow;
  onClose: () => void;
  rescheduleAction: RescheduleAction;
}) {
  const { isImpersonating } = usePortalImpersonation();
  const prefilled = `Hi — could we reschedule my ${appointment.title.toLowerCase()} on ${formatWeekdayLong(
    appointment.startAt,
  )} at ${formatTime(appointment.startAt)}? Thank you.`;

  const [body, setBody] = useState(prefilled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isImpersonating) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await rescheduleAction({
        eventId: appointment.id,
        body: trimmed,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="fixed inset-0 bg-black/60"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-[#E8E2D8]">
        <h2
          id="reschedule-title"
          className="text-[18px] font-semibold text-foreground"
        >
          Request to reschedule
        </h2>
        <p className="mt-1 text-[14px] text-foreground/70">
          Your team will get this as a new message. Feel free to edit the text
          before sending.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label htmlFor="reschedule-message" className="sr-only">
            Message to your legal team
          </label>
          <textarea
            id="reschedule-message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            disabled={isImpersonating || isPending}
            className="w-full rounded-2xl border border-[#E8E2D8] bg-white p-3 text-[15px] leading-relaxed text-foreground focus:border-[#104e60]/40 focus:outline-none focus:ring-2 focus:ring-[#104e60]/15 disabled:opacity-50"
          />
          {error ? (
            <p className="text-[13px] text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isImpersonating || isPending || !body.trim()}
              className="rounded-full bg-[#104e60] px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Sending..." : "Send request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
