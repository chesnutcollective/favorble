"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PERSONA_CONFIG,
  VIEW_AS_PERSONAS,
  type PersonaId,
} from "@/lib/personas/config";
import { setViewAsPersona, exitViewAs } from "@/app/actions/view-as";

/**
 * Dropdown submenu that lists every persona an admin can impersonate.
 * Only mount this component behind an `isAdmin` check — it does not guard
 * itself (the server action will also refuse non-admins as a backstop).
 */
export function ViewAsMenu({
  currentPersonaId,
  isViewingAs,
}: {
  currentPersonaId: PersonaId;
  isViewingAs: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  const handleSelect = (personaId: string) => {
    startTransition(() => {
      void setViewAsPersona(personaId, pathname);
    });
  };

  const handleExit = () => {
    startTransition(() => {
      void exitViewAs(pathname);
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        <span className="flex w-full items-center justify-between gap-2">
          <span>View as…</span>
          {isViewingAs && (
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
              Preview
            </span>
          )}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Preview as persona
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {VIEW_AS_PERSONAS.map((personaId) => {
          const config = PERSONA_CONFIG[personaId];
          const isCurrent = personaId === currentPersonaId;
          return (
            <DropdownMenuItem
              key={personaId}
              disabled={isPending}
              onSelect={(event) => {
                event.preventDefault();
                handleSelect(personaId);
              }}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{config.label}</span>
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="text-[11px] font-bold text-amber-600"
                >
                  ✓
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        {isViewingAs && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isPending}
              onSelect={(event) => {
                event.preventDefault();
                handleExit();
              }}
              className="text-xs font-medium text-amber-700 focus:text-amber-800"
            >
              Back to admin view
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
