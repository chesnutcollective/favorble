import { cookies } from "next/headers";
import Link from "next/link";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { resolveLocale, getTranslation } from "@/lib/i18n/getTranslation";
import { PORTAL_IMPERSONATE_COOKIE } from "../../../layout";

/**
 * Confirmation page shown after the claimant submits the NPS survey.
 */
export default async function PortalNpsThanksPage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });
  const locale = resolveLocale(session.contact.preferredLocale);
  const t = getTranslation(locale);

  return (
    <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
      <h1 className="text-[22px] font-semibold text-foreground">
        {t("portal.nps.thanks.title")}
      </h1>
      <p className="mt-2 text-[15px] text-foreground/70">
        {t("portal.nps.thanks.body")}
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
