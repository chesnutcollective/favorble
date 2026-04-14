import { cookies } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { caseStageGroups, cases, contacts } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { resolveLocale } from "@/lib/i18n/getTranslation";
import { WelcomeWizard } from "@/components/portal/welcome-wizard";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";

/**
 * Four-screen onboarding experience. Pure server component that pre-loads
 * the data the wizard needs (stage groups for screen 3, contact details for
 * screen 2) and hands them to the client-side WelcomeWizard state machine.
 */
export default async function PortalWelcomePage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });
  await logPortalActivity("view_welcome");

  const locale = resolveLocale(session.contact.preferredLocale);
  const primaryCase = session.cases[0] ?? null;

  const [contactRow] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      metadata: contacts.metadata,
    })
    .from(contacts)
    .where(eq(contacts.id, session.contact.id))
    .limit(1);

  let caseDob: Date | null = null;
  let caseSsnMasked: string | null = null;
  if (primaryCase) {
    const [caseRow] = await db
      .select({
        dateOfBirth: cases.dateOfBirth,
        ssnEncrypted: cases.ssnEncrypted,
      })
      .from(cases)
      .where(eq(cases.id, primaryCase.id))
      .limit(1);
    if (caseRow) {
      caseDob = caseRow.dateOfBirth;
      caseSsnMasked = caseRow.ssnEncrypted ? "***-**-****" : null;
    }
  }

  const stageGroups = await db
    .select({
      id: caseStageGroups.id,
      name: caseStageGroups.name,
      displayOrder: caseStageGroups.displayOrder,
      clientVisibleName: caseStageGroups.clientVisibleName,
      clientVisibleDescription: caseStageGroups.clientVisibleDescription,
    })
    .from(caseStageGroups)
    .where(
      and(
        eq(caseStageGroups.organizationId, session.portalUser.organizationId),
        eq(caseStageGroups.showToClient, true),
      ),
    )
    .orderBy(asc(caseStageGroups.displayOrder));

  const metadata = (contactRow?.metadata ?? {}) as {
    preferredChannel?: "email" | "phone" | "text";
  };
  const preferredChannel = metadata.preferredChannel ?? "email";

  return (
    <WelcomeWizard
      locale={locale}
      firstName={session.contact.firstName || ""}
      initialProfile={{
        name: `${session.contact.firstName} ${session.contact.lastName}`.trim(),
        dob: caseDob ? caseDob.toISOString() : null,
        ssnMasked: caseSsnMasked,
        phone: contactRow?.phone ?? session.contact.phone ?? "",
        email: contactRow?.email ?? session.contact.email ?? "",
        preferredChannel,
      }}
      stageGroups={stageGroups}
      isImpersonating={session.isImpersonating}
      hasPrimaryCase={primaryCase !== null}
    />
  );
}
