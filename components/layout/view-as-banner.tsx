"use client";

import { useTransition } from "react";
import { exitViewAs } from "@/app/actions/view-as";

/**
 * Sticky amber preview banner shown whenever a super-admin is actively
 * viewing the app as another persona. Actions (DB writes, audits) still
 * run as the real actor — the banner reminds the admin that UI state is
 * spoofed but identity is not.
 *
 * Uses amber deliberately (not brand blue) so preview mode is visually
 * distinct from normal navigation.
 */
export function ViewAsBanner({
  personaLabel,
  actorName,
}: {
  personaLabel: string;
  actorName: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className="sticky top-0 z-50 flex h-9 w-full items-center justify-between gap-4 bg-amber-400 px-4 text-[12px] font-medium text-amber-950 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-amber-950 text-[10px] font-bold text-amber-100"
        >
          !
        </span>
        <span className="truncate">
          Viewing as <strong className="font-semibold">{personaLabel}</strong>
          {" — Preview only. Actions run as "}
          {actorName}.
        </span>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void exitViewAs();
          })
        }
        className="flex-shrink-0 rounded border border-amber-950/30 bg-amber-950/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 transition hover:bg-amber-950/20 disabled:opacity-60"
      >
        {isPending ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}
