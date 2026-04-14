"use client";

import { usePortalImpersonation } from "./portal-impersonation-context";

/**
 * Pinned orange banner shown at the top of the portal when a staff user is
 * previewing a claimant's view. Render inside the (client) layout above the
 * shell so it always stays in sight.
 */
export function PortalImpersonationBanner() {
  const { isImpersonating, viewingName } = usePortalImpersonation();
  if (!isImpersonating) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 w-full bg-orange-500 text-white shadow-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] font-medium">
        <span>
          Viewing as <span className="font-semibold">{viewingName}</span> —
          read only
        </span>
        <a
          href="/dashboard"
          className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide hover:bg-white/25"
        >
          Exit preview
        </a>
      </div>
    </div>
  );
}
