import { requireSession } from "@/lib/auth/session";
import { ThemeWrapper } from "@/components/layout/theme-wrapper";
import { TwoTierNav } from "@/components/layout/two-tier-nav";
import { Header } from "@/components/layout/header";
import { getActiveCaseCount } from "@/app/actions/cases";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const casesCount = await getActiveCaseCount();

  return (
    <ThemeWrapper>
      <div className="ttn-app-layout">
        <TwoTierNav user={user} casesCount={casesCount} />
        <main className="ttn-main-area">
          <Header />
          <div className="flex-1 overflow-auto p-4 md:p-8">{children}</div>
        </main>
      </div>
    </ThemeWrapper>
  );
}
