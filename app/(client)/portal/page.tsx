import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/drizzle";
import { portalUsers } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { loadPortalStageView } from "@/lib/services/portal-stage-view";
import { getPendingNpsForContact } from "@/lib/services/nps-dispatch";
import { getTranslation, resolveLocale } from "@/lib/i18n/getTranslation";
import { StageProgressCard } from "@/components/portal/stage-progress-card";
import { NpsHomeBanner } from "@/components/portal/nps-home-banner";
import { PORTAL_IMPERSONATE_COOKIE } from "../layout";

/** Within this window after activation, treat visits as a first-run session. */
const FIRST_RUN_WINDOW_MS = 5 * 60 * 1000;

/**
 * Portal home. Shows a stage-progress card and timeline built from the
 * claimant's primary case. First-time visitors are redirected to /portal/welcome.
 */
export default async function PortalHomePage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  // First-run routing: if the portal user was activated within the last few
  // minutes AND hasn't logged in more than once, push them to the welcome
  // wizard. Staff impersonating the portal stay on the real view so they can
  // see what the claimant will see.
  if (!session.isImpersonating && session.portalUser.loginCount <= 1) {
    const [activationRow] = await db
      .select({ activatedAt: portalUsers.activatedAt })
      .from(portalUsers)
      .where(eq(portalUsers.id, session.portalUser.id))
      .limit(1);
    const activatedAt = activationRow?.activatedAt ?? null;
    if (
      activatedAt &&
      Date.now() - new Date(activatedAt).getTime() < FIRST_RUN_WINDOW_MS
    ) {
      redirect("/portal/welcome");
    }
  }

  await logPortalActivity("view_stage");

  const locale = resolveLocale(session.contact.preferredLocale);
  const t = getTranslation(locale);
  const primaryCase = session.cases[0] ?? null;

  // Pending NPS survey banner. Shown when the dispatcher has already stamped
  // `sent_at` (delivery attempted) or when the campaign is portal-channel.
  // Staff impersonation still sees the banner so they can QA the flow.
  const pendingNps = await getPendingNpsForContact(session.contact.id);
  const firstPending = pendingNps[0] ?? null;

  const stageView = primaryCase
    ? await loadPortalStageView(
        primaryCase.id,
        session.portalUser.organizationId,
      )
    : null;

  if (!primaryCase || !stageView) {
    return (
      <div className="space-y-4">
        {firstPending && (
          <NpsHomeBanner
            responseId={firstPending.id}
            heading={t("portal.nps.banner.heading")}
            body={t("portal.nps.banner.body")}
            cta={t("portal.nps.banner.cta")}
            dismissLabel={t("portal.nps.banner.dismiss")}
          />
        )}
        <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
          <h1 className="text-[22px] font-semibold text-foreground">
            {session.contact.firstName || "Welcome"}
          </h1>
          <p className="mt-2 text-[17px] text-foreground/70">
            We&apos;re still setting up your case. Check back shortly — your
            attorney&apos;s team will reach out with the next step.
          </p>
        </section>
      </div>
    );
  }

  const currentStage = stageView.stages.find(
    (s) => s.id === stageView.currentStageId,
  );
  const currentStageIndex = currentStage
    ? stageView.stages.findIndex((s) => s.id === currentStage.id)
    : -1;
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < stageView.stages.length - 1
      ? stageView.stages[currentStageIndex + 1]
      : null;
  const currentGroup = currentStage
    ? stageView.stageGroups.find((g) => g.id === currentStage.stageGroupId)
    : null;

  const currentStageClientVisible = currentGroup?.clientVisibleName ?? null;
  const currentStageDescription =
    currentGroup?.clientVisibleDescription ?? currentStage?.description ?? null;
  const nextGroup = nextStage
    ? stageView.stageGroups.find((g) => g.id === nextStage.stageGroupId)
    : null;

  const dots = stageView.stages.slice(0, 24).map((s) => ({
    id: s.id,
    name: s.name,
    clientVisibleName:
      stageView.stageGroups.find((g) => g.id === s.stageGroupId)
        ?.clientVisibleName ?? null,
    displayOrder: s.displayOrder,
  }));

  return (
    <div className="space-y-6">
      {firstPending && (
        <NpsHomeBanner
          responseId={firstPending.id}
          heading={t("portal.nps.banner.heading")}
          body={t("portal.nps.banner.body")}
          cta={t("portal.nps.banner.cta")}
          dismissLabel={t("portal.nps.banner.dismiss")}
        />
      )}
      <StageProgressCard
        locale={locale}
        stages={dots}
        currentStageId={stageView.currentStageId}
        currentStageName={currentStage?.name ?? ""}
        currentStageClientVisibleName={currentStageClientVisible}
        currentStageDescription={currentStageDescription}
        nextStageName={nextStage?.name ?? null}
        nextStageClientVisibleName={nextGroup?.clientVisibleName ?? null}
        // `clientEstimatedDays` is intentionally absent from the schema today —
        // we leave this null and the card hides the timeline line gracefully.
        nextStageEstimatedDays={null}
        stageEnteredAt={stageView.stageEnteredAt}
        transitions={stageView.transitions
          .slice()
          .reverse()
          .map((transition) => ({
            id: transition.id,
            toStageName: transition.toStageName,
            toStageClientVisibleName: null,
            transitionedAt: transition.transitionedAt,
          }))}
      />
    </div>
  );
}
