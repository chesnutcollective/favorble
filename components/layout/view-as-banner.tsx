"use client";

import { useTransition, useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { exitViewAs, setViewAsPersona } from "@/app/actions/view-as";
import {
  PERSONA_CONFIG,
  VIEW_AS_PERSONAS,
  type PersonaId,
} from "@/lib/personas/config";

/**
 * Sticky amber preview banner shown whenever a super-admin is actively
 * viewing the app as another persona. Actions (DB writes, audits) still
 * run as the real actor — the banner reminds the admin that UI state is
 * spoofed but identity is not.
 *
 * The persona name is now a dropdown — admins can hop between personas
 * directly from the banner without going through the avatar menu.
 */
export function ViewAsBanner({
  personaLabel,
  personaId,
  actorName,
}: {
  personaLabel: string;
  personaId: PersonaId;
  actorName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleSwitch = (target: PersonaId) => {
    setOpen(false);
    if (target === personaId) return;
    startTransition(() => {
      void setViewAsPersona(target, pathname);
    });
  };

  const handleExit = () => {
    startTransition(() => {
      void exitViewAs(pathname);
    });
  };

  return (
    <div
      className="sticky top-0 z-50 flex h-9 w-full items-center justify-between gap-4 bg-amber-400 pl-4 pr-16 sm:pr-20 text-[12px] font-medium text-amber-950 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-amber-950 text-[10px] font-bold text-amber-100"
        >
          !
        </span>
        <span className="flex-shrink-0">Viewing as</span>
        {/* The persona-switcher dropdown — kept outside any overflow-hidden
            ancestor so its absolute menu can render below the banner */}
        <div ref={wrapperRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            disabled={isPending}
            aria-haspopup="menu"
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded border border-amber-950/30 bg-amber-950/10 px-2 py-0.5 text-[12px] font-semibold text-amber-950 hover:bg-amber-950/20 transition disabled:opacity-60"
          >
            <span>{personaLabel}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {open && (
            <div
              role="menu"
              className="absolute left-0 top-full z-[60] mt-1 w-56 max-h-[60vh] overflow-y-auto rounded-md border border-amber-950/20 bg-white shadow-lg ring-1 ring-amber-950/5"
            >
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950/70">
                Switch preview to
              </div>
              <div className="border-t border-amber-950/10" />
              {VIEW_AS_PERSONAS.filter((id) => id !== "admin").map((id) => {
                const cfg = PERSONA_CONFIG[id];
                const isCurrent = id === personaId;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitch(id)}
                    disabled={isPending}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[12px] hover:bg-amber-50 disabled:opacity-60 ${
                      isCurrent
                        ? "bg-amber-50 font-semibold text-amber-900"
                        : "text-zinc-800"
                    }`}
                  >
                    <span className="truncate">{cfg.label}</span>
                    {isCurrent && (
                      <span
                        aria-hidden="true"
                        className="text-[12px] text-amber-600"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span className="hidden truncate sm:inline">
          {" — Preview only. Actions run as "}
          {actorName}.
        </span>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleExit}
        className="flex-shrink-0 rounded border border-amber-950/30 bg-amber-950/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 transition hover:bg-amber-950/20 disabled:opacity-60"
      >
        {isPending ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}
