"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home,
  MessageSquare,
  FileText,
  CalendarDays,
  User,
  Activity,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalT } from "./use-portal-t";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Mobile (< 768px) bottom tab bar for the claimant portal.
 *
 * Strategy: 5 primary tabs — Home, Messages, Documents, Appointments, More —
 * with Treatment log and Profile tucked into the "More" bottom sheet.
 *
 * Why overflow vs. collapsing Appointments + Treatment log into a single
 * "Activity" tab:
 *   - Treatment log is a write-heavy daily task for claimants, while
 *     Appointments is a read-heavy calendar view. They're conceptually
 *     different flows; merging them behind one label would obscure both.
 *   - Profile is low-frequency (account settings). Pushing it into an
 *     overflow sheet costs one tap for a page visited ~weekly at most.
 *   - 5 evenly-sized tabs at 56px tall + 11px label clear 44×44px tap
 *     targets on every phone we support.
 */
type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/portal", labelKey: "portal.nav.home", icon: Home },
  {
    href: "/portal/messages",
    labelKey: "portal.nav.messages",
    icon: MessageSquare,
  },
  {
    href: "/portal/documents",
    labelKey: "portal.nav.documents",
    icon: FileText,
  },
  {
    href: "/portal/appointments",
    labelKey: "portal.nav.appointments",
    icon: CalendarDays,
  },
];

const OVERFLOW_ITEMS: NavItem[] = [
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

export function PortalBottomNav({ pathname }: { pathname: string | null }) {
  const { t, locale } = usePortalT();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreLabel = locale === "es" ? "Más" : "More";
  const moreSheetTitle = locale === "es" ? "Más opciones" : "More options";

  const overflowActive = OVERFLOW_ITEMS.some((item) =>
    isActivePath(pathname, item.href),
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8E2D8] bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto flex max-w-5xl items-stretch justify-around">
          {PRIMARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "text-brand"
                      : "text-foreground/60 hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              aria-current={overflowActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[11px] font-medium transition-colors",
                overflowActive
                  ? "text-brand"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              <MoreHorizontal aria-hidden className="size-5" />
              <span>{moreLabel}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-[#E8E2D8]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <SheetHeader>
            <SheetTitle>{moreSheetTitle}</SheetTitle>
          </SheetHeader>
          <ul className="mt-2 flex flex-col gap-1">
            {OVERFLOW_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors",
                      active
                        ? "bg-brand text-white"
                        : "text-foreground/80 hover:bg-[#F7F5F2]",
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
