import { cookies } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { npsResponses } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { resolveLocale, getTranslation } from "@/lib/i18n/getTranslation";
import { PORTAL_IMPERSONATE_COOKIE } from "../../../layout";
import { NpsSurveyForm } from "./nps-survey-form";

/**
 * Phase 5 A2 — claimant-facing NPS survey page.
 *
 * Renders the scoring UI when the response row is unanswered and belongs to
 * the current portal user's contact. When already answered, shows a short
 * confirmation. When not found / cross-tenant, shows a neutral not-found.
 */
export default async function PortalNpsSurveyPage({
  params,
}: {
  params: Promise<{ responseId: string }>;
}) {
  const { responseId } = await params;
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });
  const locale = resolveLocale(session.contact.preferredLocale);
  const t = getTranslation(locale);

  let row:
    | {
        id: string;
        contactId: string;
        respondedAt: Date | null;
      }
    | null = null;

  try {
    const [found] = await db
      .select({
        id: npsResponses.id,
        contactId: npsResponses.contactId,
        respondedAt: npsResponses.respondedAt,
      })
      .from(npsResponses)
      .where(eq(npsResponses.id, responseId))
      .limit(1);
    row = found ?? null;
  } catch {
    row = null;
  }

  // Cross-tenant / missing → neutral "not found" copy (never leak existence).
  if (!row || row.contactId !== session.contact.id) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
        <h1 className="text-[22px] font-semibold text-foreground">
          {t("portal.nps.survey.notFoundTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-foreground/70">
          {t("portal.nps.survey.notFoundBody")}
        </p>
        <div className="mt-6">
          <Link
            href="/portal"
            className="inline-flex items-center rounded-lg bg-[#263c94] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#1e2f78]"
          >
            {t("portal.nps.thanks.back")}
          </Link>
        </div>
      </section>
    );
  }

  if (row.respondedAt) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
        <h1 className="text-[22px] font-semibold text-foreground">
          {t("portal.nps.thanks.title")}
        </h1>
        <p className="mt-2 text-[15px] text-foreground/70">
          {t("portal.nps.survey.alreadyReceived")}
        </p>
        <div className="mt-6">
          <Link
            href="/portal"
            className="inline-flex items-center rounded-lg bg-[#263c94] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#1e2f78]"
          >
            {t("portal.nps.survey.alreadyReceivedBack")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
      <h1 className="text-[22px] font-semibold text-foreground">
        {t("portal.nps.survey.title")}
      </h1>
      <p className="mt-2 text-[15px] text-foreground/70">
        {t("portal.nps.survey.subtitle")}
      </p>
      <NpsSurveyForm
        responseId={row.id}
        labels={{
          scaleLowLabel: t("portal.nps.survey.scaleLowLabel"),
          scaleHighLabel: t("portal.nps.survey.scaleHighLabel"),
          commentLabel: t("portal.nps.survey.commentLabel"),
          commentPlaceholder: t("portal.nps.survey.commentPlaceholder"),
          submit: t("portal.nps.survey.submit"),
          submitting: t("portal.nps.survey.submitting"),
          errorGeneric: t("common.errorGeneric"),
        }}
      />
    </section>
  );
}
