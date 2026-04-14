"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  FileText,
  CalendarDays,
  User,
  LogOut,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalImpersonation } from "./portal-impersonation-context";
import { PortalLocaleProvider, usePortalT } from "./use-portal-t";

export type PortalShellProps = {
  claimantName: string;
  caseNumber: string | null;
  locale: string;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/portal", labelKey: "portal.nav.home", icon: Home },
  {
    href: "/portal/messages",
    labelKey: "portal.nav.messages",
    icon: MessageSquare,
  },
  {
    href: "/portal/appointments",
    labelKey: "portal.nav.appointments",
    icon: CalendarDays,
  },
  {
    href: "/portal/documents",
    labelKey: "portal.nav.documents",
    icon: FileText,
  },
  {
    href: "/portal/treatment-log",
    labelKey: "portal.nav.treatmentLog",
    icon: Activity,
  },
  { href: "/portal/profile", labelKey: "portal.nav.profile", icon: User },
];

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Top bar + responsive navigation (left rail on desktop, bottom tabs on mobile).
 * Wraps children in a PortalLocaleProvider so nested client components can
 * call `usePortalT()` without each having to fetch the locale again.
 */
export function PortalShell({
  claimantName,
  caseNumber,
  locale,
  children,
}: PortalShellProps) {
  return (
    <PortalLocaleProvider locale={locale}>
      <PortalShellInner
        claimantName={claimantName}
        caseNumber={caseNumber}
        locale={locale}
      >
        {children}
      </PortalShellInner>
    </PortalLocaleProvider>
  );
}

function PortalShellInner({
  claimantName,
  caseNumber,
  locale,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const { isImpersonating } = usePortalImpersonation();

  return (
    <div className="min-h-screen bg-[#F7F5F2] text-foreground">
      <PortalTopBar
        claimantName={claimantName}
        caseNumber={caseNumber}
        locale={locale}
        isImpersonating={isImpersonating}
      />

      <div className="mx-auto flex w-full max-w-5xl gap-6 px-4 pb-28 pt-6 lg:gap-8 lg:pb-10 lg:pt-8">
        <aside
          className="hidden lg:block lg:w-56 lg:shrink-0"
          aria-label="Portal navigation"
        >
          <nav className="sticky top-24 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <DesktopNavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}

function PortalTopBar({
  claimantName,
  caseNumber,
  locale,
  isImpersonating,
}: {
  claimantName: string;
  caseNumber: string | null;
  locale: string;
  isImpersonating: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E8E2D8] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/portal"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#104e60] text-[12px] font-bold text-white">
            F
          </span>
          <span className="hidden sm:inline">Favorble</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-center text-center">
          <span className="truncate text-[13px] text-muted-foreground">
            {claimantName}
            {caseNumber ? (
              <>
                {" "}
                &middot;{" "}
                <span className="font-mono text-[12px] text-foreground/70">
                  {caseNumber}
                </span>
              </>
            ) : null}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <LocaleToggle locale={locale} />
          {!isImpersonating ? (
            <Link
              href="/logout"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:border-[#CCC]"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Lightweight locale toggle — Wave 2 will wire a server action; for now we
 * just update a search param so the page server component can read it and
 * nothing else breaks.
 */
function LocaleToggle({ locale }: { locale: string }) {
  const normalized = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const nextLocale = normalized === "es" ? "en" : "es";
  return (
    <Link
      href={`?locale=${nextLocale}`}
      className="inline-flex h-7 items-center rounded-full border border-border bg-white px-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/70 hover:border-[#CCC]"
      aria-label={`Switch language to ${nextLocale === "es" ? "Español" : "English"}`}
    >
      {normalized === "es" ? "ES" : "EN"}
    </Link>
  );
}

function DesktopNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const { t } = usePortalT();
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors",
        active
          ? "bg-[#104e60] text-white"
          : "text-foreground/70 hover:bg-white hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

function MobileBottomNav({ pathname }: { pathname: string | null }) {
  const { t } = usePortalT();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8E2D8] bg-white/95 backdrop-blur lg:hidden"
      aria-label="Portal navigation"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-around px-2 py-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-[#104e60]"
                    : "text-foreground/60 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                <span>{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
