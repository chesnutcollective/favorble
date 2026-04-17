"use client";

/**
 * MobileAppBar — the sticky top bar shown on screens below the `lg`
 * breakpoint (< 1024px). It replaces the fixed two-tier rail + panel on
 * small viewports with a compact header that hosts:
 *
 *   • Hamburger button (left) — opens a full-height slide-in drawer
 *     containing the persona-scoped TwoTierNav content.
 *   • Favorble wordmark / logo (center-left).
 *   • Search (⌘K) trigger (right) — opens the existing CommandPalette.
 *   • View-as / profile menu (right, admin only) — keeps the "view as"
 *     affordance available on mobile without cloning the avatar dropdown.
 *
 * The drawer itself is rendered inline as a shadcn `Sheet` wrapping a
 * mobile-mode instance of `<TwoTierNav>`. Sheet handles focus trap,
 * Escape-to-close, backdrop dismissal, and focus restore automatically
 * (it's a Radix Dialog under the hood). We explicitly close on route
 * change via the `usePathname` effect below.
 *
 * This component is hidden on `lg` (≥1024px) viewports via the Tailwind
 * `lg:hidden` utility on its outermost wrapper. The desktop two-tier nav
 * rendered in the app layout remains the ≥1024px experience.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TwoTierNav } from "@/components/layout/two-tier-nav";
import { CommandPalette } from "@/components/search/command-palette";
import type { SessionUser } from "@/lib/auth/session";
import type { NavPanelData } from "@/app/actions/nav-data";
import type { CommitEntry } from "@/app/actions/changelog";
import type { DashboardSubnavData } from "@/lib/dashboard-subnav/types";
import type { PersonaId } from "@/lib/personas/config";

interface MobileAppBarProps {
  user: SessionUser;
  casesCount?: number;
  navData?: NavPanelData;
  subnavData?: DashboardSubnavData;
  personaNav: string[];
  isAdmin: boolean;
  currentPersonaId: PersonaId;
  isViewingAs: boolean;
  changelogCommits?: CommitEntry[];
}

export function MobileAppBar({
  user,
  casesCount,
  navData,
  subnavData,
  personaNav,
  isAdmin,
  currentPersonaId,
  isViewingAs,
  changelogCommits,
}: MobileAppBarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes so tapping a nav item
  // doesn't leave the drawer hanging open over the newly-loaded page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <header
        className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-card)] px-3"
        role="banner"
      >
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-controls="mobile-nav-drawer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--text-1)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="22"
                height="22"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </SheetTrigger>

          <SheetContent
            id="mobile-nav-drawer"
            side="left"
            className="ttn-mobile-sheet w-[88vw] max-w-[340px] p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Primary navigation, panel contents for the current section, and
              your profile.
            </SheetDescription>
            <TwoTierNav
              user={user}
              casesCount={casesCount}
              navData={navData}
              subnavData={subnavData}
              personaNav={personaNav}
              isAdmin={isAdmin}
              currentPersonaId={currentPersonaId}
              isViewingAs={isViewingAs}
              changelogCommits={changelogCommits}
            />
          </SheetContent>
        </Sheet>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]"
          aria-label="Hogan Smith — Dashboard"
        >
          <span className="flex h-8 w-10 items-center justify-center overflow-hidden rounded-md">
            <Image
              src="/hogansmith-badge.png"
              alt=""
              width={88}
              height={64}
              priority
              className="h-full w-full object-contain"
            />
          </span>
          <span className="hidden sm:inline">Hogan Smith</span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <CommandPalette />
        </div>
      </header>
    </div>
  );
}
