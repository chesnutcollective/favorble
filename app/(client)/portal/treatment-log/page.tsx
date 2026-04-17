import Link from "next/link";
import { cookies } from "next/headers";
import { Activity, Plus, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { resolveLocale } from "@/lib/i18n/getTranslation";
import {
  listPortalTreatmentEntries,
  type ClientTreatmentLogRow,
} from "@/app/actions/client-treatment-log";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";

const REASON_LABELS_EN: Record<string, string> = {
  primary_care: "Primary care",
  specialist: "Specialist",
  er: "ER",
  hospital: "Hospital",
  therapy: "Therapy",
  diagnostic: "Diagnostic",
  other: "Other",
};

const REASON_LABELS_ES: Record<string, string> = {
  primary_care: "Médico de cabecera",
  specialist: "Especialista",
  er: "Sala de emergencias",
  hospital: "Hospital",
  therapy: "Terapia",
  diagnostic: "Diagnóstico",
  other: "Otro",
};

/**
 * /portal/treatment-log — the claimant's list of submitted visits.
 *
 * Pending entries render at the top, followed by merged ("Reviewed") and
 * rejected ("Needs clarification — we'll reach out"). Impersonating staff
 * see the same list but the "Log a visit" CTA is disabled.
 */
export default async function PortalTreatmentLogPage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  await logPortalActivity("view_treatment_log");

  const locale = resolveLocale(session.contact.preferredLocale);
  const isSpanish = locale === "es";
  const labels = isSpanish ? REASON_LABELS_ES : REASON_LABELS_EN;

  let entries: ClientTreatmentLogRow[] = [];
  try {
    entries = await listPortalTreatmentEntries();
  } catch {
    entries = [];
  }

  const hasCase = session.cases.length > 0;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">
              {isSpanish ? "Registro de tratamiento" : "Treatment log"}
            </h1>
            <p className="mt-1 text-[15px] text-foreground/70">
              {isSpanish
                ? "Registre cada visita médica para que su equipo la añada a su historial clínico."
                : "Log each medical visit so your team can add it to your case file."}
            </p>
          </div>
          {hasCase ? (
            <Link
              href="/portal/treatment-log/new"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#104e60] px-5 text-[14px] font-semibold text-white hover:bg-[#0d3f4e]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {isSpanish ? "Registrar visita" : "Log a visit"}
            </Link>
          ) : null}
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#104e60]/10 text-[#104e60]">
            <Activity className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[15px] font-medium text-foreground">
            {isSpanish
              ? "Aún no ha registrado visitas."
              : "No visits logged yet."}
          </p>
          <p className="mt-1 text-[14px] text-foreground/70">
            {isSpanish
              ? "Cada vez que visite a un médico, registre la visita aquí y su equipo actualizará su expediente."
              : "Whenever you see a provider, add the visit here and your team will update your file."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <TreatmentLogCard
                entry={entry}
                reasonLabel={entry.reason ? (labels[entry.reason] ?? entry.reason) : null}
                isSpanish={isSpanish}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TreatmentLogCard({
  entry,
  reasonLabel,
  isSpanish,
}: {
  entry: ClientTreatmentLogRow;
  reasonLabel: string | null;
  isSpanish: boolean;
}) {
  const visit = new Date(entry.visitDate);

  let badge: {
    icon: typeof Clock;
    label: string;
    className: string;
  };
  if (entry.status === "pending") {
    badge = {
      icon: Clock,
      label: isSpanish ? "Pendiente" : "Pending",
      className: "bg-[#F3F3F0] text-foreground/70",
    };
  } else if (entry.status === "merged") {
    badge = {
      icon: CheckCircle2,
      label: isSpanish ? "Revisado" : "Reviewed",
      className: "bg-emerald-100 text-emerald-800",
    };
  } else {
    badge = {
      icon: AlertCircle,
      label: isSpanish
        ? "Necesita aclaración — le contactaremos"
        : "Needs clarification — we'll reach out",
      className: "bg-amber-100 text-amber-900",
    };
  }
  const BadgeIcon = badge.icon;

  return (
    <article className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[16px] font-semibold text-foreground">
              {entry.providerName}
            </h2>
            {reasonLabel ? (
              <span className="rounded-full bg-[#F3F3F0] px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                {reasonLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-foreground/70">
            {isSpanish ? "Visita del " : "Visit on "}
            <time dateTime={visit.toISOString()}>
              {visit.toLocaleDateString(isSpanish ? "es-US" : "en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </p>
          {entry.notes && entry.status !== "rejected" ? (
            <p className="mt-2 whitespace-pre-wrap text-[14px] text-foreground/80">
              {entry.notes}
            </p>
          ) : null}
          {entry.receipt ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#F7F5F2] px-3 py-1.5 text-[12px] text-foreground/70">
              <FileText className="size-4" aria-hidden="true" />
              <span className="truncate max-w-[220px]">
                {entry.receipt.fileName}
              </span>
            </div>
          ) : null}
          {entry.clientFacingRejectionMessage ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
              {isSpanish
                ? "Su equipo necesita un poco más de información sobre esta visita — le contactarán con los siguientes pasos."
                : entry.clientFacingRejectionMessage}
            </p>
          ) : null}
        </div>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}
        >
          <BadgeIcon className="size-3.5" />
          {badge.label}
        </span>
      </div>
    </article>
  );
}
