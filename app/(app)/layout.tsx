import { Suspense } from "react";
import { ThemeWrapper } from "@/components/layout/theme-wrapper";
import { TwoTierNav } from "@/components/layout/two-tier-nav";
import { Header } from "@/components/layout/header";
import { PageTransition } from "@/components/layout/page-transition";
import { ViewAsBanner } from "@/components/layout/view-as-banner";
import { getActiveCaseCount } from "@/app/actions/cases";
import { getNavPanelData } from "@/app/actions/nav-data";
import { getChangelogCommits } from "@/app/actions/changelog";
import { requireEffectivePersona } from "@/lib/personas/effective-persona";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const persona = await requireEffectivePersona();
  const [casesCount, navData, changelogResult] = await Promise.all([
    getActiveCaseCount(),
    getNavPanelData().catch(() => undefined),
    getChangelogCommits().catch(() => ({ commits: [], hasMore: false })),
  ]);

  const isAdmin = persona.actorPersonaId === "admin";
  const actorName = `${persona.actor.firstName} ${persona.actor.lastName}`;

  return (
    <ThemeWrapper>
      {persona.isViewingAs && (
        <ViewAsBanner
          personaLabel={persona.config.label}
          actorName={actorName}
        />
      )}
      <div className="ttn-app-layout">
        <Suspense>
          <TwoTierNav
            user={persona.actor}
            casesCount={casesCount}
            navData={navData}
            personaNav={persona.config.nav}
            isAdmin={isAdmin}
            currentPersonaId={persona.personaId}
            isViewingAs={persona.isViewingAs}
            changelogCommits={changelogResult.commits}
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
