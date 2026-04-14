"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Dismissible NPS prompt rendered above the stage card on the portal home.
 * Dismissal is session-local (component state) — the survey row stays pending
 * in the DB so the banner reappears on next navigation. This is intentional:
 * we do want a persistent nudge until the claimant either answers or the row
 * expires on the staff side.
 */
export function NpsHomeBanner({
  responseId,
  heading,
  body,
  cta,
  dismissLabel,
}: {
  responseId: string;
  heading: string;
  body: string;
  cta: string;
  dismissLabel: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <aside
      role="region"
      aria-label={heading}
      className="flex flex-col gap-3 rounded-2xl bg-[#263c94] p-5 text-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div>
        <p className="text-[15px] font-semibold">{heading}</p>
        <p className="mt-1 text-[14px] text-white/80">{body}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/portal/nps/${responseId}`}
          className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-[#263c94] hover:bg-white/90"
        >
          {cta}
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center rounded-lg border border-white/30 px-3 py-2 text-[13px] font-medium text-white/80 hover:bg-white/10"
        >
          {dismissLabel}
        </button>
      </div>
    </aside>
  );
}
