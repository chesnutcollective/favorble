"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

/**
 * Compact sticky top bar for the portal on mobile (< 768px / `md`).
 *
 * Intentionally strips the full claimant name to keep the bar readable on
 * narrow devices — the case number is the stable identifier and is what
 * the client is most likely to read back during a phone call with staff.
 *
 * Rendered next to `PortalBottomNav`; the desktop (`md+`) layout continues
 * to use the `PortalShell` side rail + full top bar.
 */
export type PortalMobileHeaderProps = {
  caseNumber: string | null;
  locale: string;
  isImpersonating: boolean;
};

export function PortalMobileHeader({
  caseNumber,
  locale,
  isImpersonating,
}: PortalMobileHeaderProps) {
  const normalized = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const nextLocale = normalized === "es" ? "en" : "es";
  const visibleLabel = normalized === "es" ? "ES" : "EN";
  const nextName = nextLocale === "es" ? "Español" : "English";

  return (
    <header
      className="sticky top-0 z-40 border-b border-[#E8E2D8] bg-white/95 backdrop-blur md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Link
          href="/portal"
          aria-label="Favorble portal home"
          className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-foreground"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white"
          >
            F
          </span>
          {caseNumber ? (
            <span className="font-mono text-[12px] text-foreground/70">
              {caseNumber}
            </span>
          ) : (
            <span className="text-[13px] text-foreground">Favorble</span>
          )}
        </Link>

        <div className="flex items-center gap-1.5">
          <Link
            href={`?locale=${nextLocale}`}
            aria-label={`${visibleLabel} — switch language to ${nextName}`}
            className="inline-flex h-9 min-w-11 items-center justify-center rounded-full border border-border bg-white px-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/70 hover:border-[#CCC]"
          >
            {visibleLabel}
          </Link>
          {!isImpersonating ? (
            <Link
              href="/logout"
              aria-label="Log out"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-foreground/70 hover:border-[#CCC]"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
