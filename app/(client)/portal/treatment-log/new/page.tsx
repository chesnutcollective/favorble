import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { resolveLocale } from "@/lib/i18n/getTranslation";
import { PORTAL_IMPERSONATE_COOKIE } from "../../../layout";
import { TreatmentLogForm } from "./treatment-log-form";

/**
 * /portal/treatment-log/new — form for logging a single visit.
 *
 * Impersonating staff can open the form but it's rendered in read-only mode
 * via TreatmentLogForm's internal isImpersonating check.
 */
export default async function NewTreatmentLogEntryPage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  const locale = resolveLocale(session.contact.preferredLocale);
  const isSpanish = locale === "es";

  const primaryCase = session.cases[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/treatment-log"
          className="inline-flex items-center gap-1 text-[13px] text-foreground/70 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {isSpanish ? "Volver al registro" : "Back to log"}
        </Link>
      </div>

      <header className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">
          {isSpanish ? "Registrar una visita" : "Log a visit"}
        </h1>
        <p className="mt-1 text-[15px] text-foreground/70">
          {isSpanish
            ? "Comparta los detalles básicos de su visita médica — su equipo lo añadirá a su expediente."
            : "Share the basics of your medical visit — your team will add it to your case file."}
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        {primaryCase ? (
          <TreatmentLogForm caseId={primaryCase.id} isSpanish={isSpanish} />
        ) : (
          <p className="text-[14px] text-foreground/70">
            {isSpanish
              ? "Aún no hay un caso vinculado a su cuenta."
              : "No case is linked to your account yet."}
          </p>
        )}
      </section>
    </div>
  );
}
