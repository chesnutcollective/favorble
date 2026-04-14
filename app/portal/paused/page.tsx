import type { Metadata } from "next";
import Link from "next/link";

/**
 * Phase 6 — "Your portal access has been paused" landing page.
 *
 * Rendered when a portal_users row is marked `status='suspended'` by staff
 * (see app/actions/portal-invites.ts → revokePortalAccess). This page lives
 * OUTSIDE the `(client)` route group on purpose so the layout does not try
 * to re-load a session and loop forever.
 */
export const metadata: Metadata = {
  title: "Portal access paused",
};

export default function PortalPausedPage() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-[#F7F5F2] px-4 py-12"
    >
      <section
        aria-labelledby="paused-heading"
        className="max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]"
      >
        <h1
          id="paused-heading"
          className="text-[22px] font-semibold tracking-tight text-foreground"
        >
          Your portal access has been paused
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground/70">
          Please contact your attorney&apos;s office. They will be able to
          restore access once any outstanding questions are resolved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/logout"
            className="inline-flex h-9 items-center rounded-full border border-border bg-white px-4 text-[13px] font-medium text-foreground/80 hover:border-[#CCC]"
          >
            Sign out
          </Link>
        </div>
      </section>
    </main>
  );
}
