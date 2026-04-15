import { Suspense } from "react";
import { cookies } from "next/headers";
import { ThemeWrapper } from "@/components/layout/theme-wrapper";
import { TwoTierNav } from "@/components/layout/two-tier-nav";
import { Header } from "@/components/layout/header";
import { PageTransition } from "@/components/layout/page-transition";
import { ViewAsBanner } from "@/components/layout/view-as-banner";
import { getActiveCaseCount } from "@/app/actions/cases";
import { getNavPanelData } from "@/app/actions/nav-data";
import { getChangelogCommits } from "@/app/actions/changelog";
import { getDashboardSubnavData } from "@/app/actions/dashboard-subnav";
import { requireEffectivePersona } from "@/lib/personas/effective-persona";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const persona = await requireEffectivePersona();
  const cookieStore = await cookies();
  const initialCollapsed =
    cookieStore.get("ttn-rail-collapsed")?.value === "1";
  const [casesCount, navData, changelogResult, subnavData] = await Promise.all([
    getActiveCaseCount(),
    getNavPanelData().catch(() => undefined),
    getChangelogCommits().catch(() => ({ commits: [], hasMore: false })),
    getDashboardSubnavData(
      persona.personaId,
      persona.actor.organizationId,
      persona.actor.id,
    ).catch(() => undefined),
  ]);

  const isAdmin = persona.actorPersonaId === "admin";
  const actorName = `${persona.actor.firstName} ${persona.actor.lastName}`;

  return (
    <ThemeWrapper>
      {persona.isViewingAs && (
        <ViewAsBanner
          personaLabel={persona.config.label}
          personaId={persona.personaId}
          actorName={actorName}
        />
      )}
      <div className={`ttn-app-layout${persona.isViewingAs ? " has-view-as-banner" : ""}`}>
        <Suspense>
          <TwoTierNav
            user={persona.actor}
            casesCount={casesCount}
            navData={navData}
            subnavData={subnavData}
            personaNav={persona.config.nav}
            isAdmin={isAdmin}
            currentPersonaId={persona.personaId}
            isViewingAs={persona.isViewingAs}
            changelogCommits={changelogResult.commits}
            initialCollapsed={initialCollapsed}
          />
        </Suspense>
        <main className="ttn-main-area">
          <Header />
          <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-8">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
      {isAdmin && <FeedbackWidget />}
    </ThemeWrapper>
  );
}
