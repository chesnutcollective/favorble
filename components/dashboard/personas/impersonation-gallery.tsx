"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PERSONA_ACCENTS } from "@/lib/design-tokens";
import {
  PERSONA_CONFIG,
  VIEW_AS_PERSONAS,
  type PersonaId,
} from "@/lib/personas/config";
import { getPersonaIcon } from "@/lib/personas/icons";
import { setViewAsPersona } from "@/app/actions/view-as";

/**
 * Admin-only gallery of persona cards that lets an admin preview each
 * teammate's dashboard in one click. The card structure matches the spec
 * in the "persona icon + goals + challenges" design brief: large icon tile
 * on the left, label + workspaceDescription on the right, goals and
 * challenges stacked below, and a full-width outline CTA.
 *
 * The CTA wires into the same `setViewAsPersona` server action used by the
 * dropdown `<ViewAsMenu />`, so behaviour stays consistent across entry
 * points. `admin` and `viewer` are filtered out upstream — the gallery
 * shows the twelve role-specific personas an admin might impersonate.
 */
export function ImpersonationGallery() {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  // Exclude `admin` (actor already is admin) and `viewer` (placeholder only).
  const personas = VIEW_AS_PERSONAS.filter(
    (id) => id !== "admin" && id !== "viewer",
  );

  const handleImpersonate = (personaId: PersonaId) => {
    startTransition(() => {
      void setViewAsPersona(personaId, pathname);
    });
  };

  return (
    <section aria-labelledby="impersonation-gallery-heading" className="mt-8">
      <div className="mb-4">
        <h2
          id="impersonation-gallery-heading"
          className="text-lg font-semibold"
        >
          Preview a teammate&apos;s day
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jump into any persona&apos;s workspace to see what their day looks
          like in Favorble. You can switch back from the user menu at any
          time.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {personas.map((personaId) => {
          const config = PERSONA_CONFIG[personaId];
          const accent = PERSONA_ACCENTS[personaId];
          const Icon = getPersonaIcon(config.icon);
          return (
            <article
              key={personaId}
              className="rounded-lg border bg-card p-5 transition-colors hover:border-[var(--border-hover,#CCC)]"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: accent?.accentSubtle,
                    color: accent?.accent,
                  }}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">{config.label}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {config.workspaceDescription}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Today they&apos;re working on
                  </p>
                  <ul className="mt-1 space-y-1">
                    {config.goals.map((goal) => (
                      <li key={goal} className="flex gap-2 leading-snug">
                        <span
                          aria-hidden="true"
                          className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: accent?.accent ?? "currentColor",
                          }}
                        />
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Common challenges
                  </p>
                  <ul className="mt-1 space-y-1">
                    {config.challenges.map((challenge) => (
                      <li key={challenge} className="flex gap-2 leading-snug">
                        <span
                          aria-hidden="true"
                          className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                        />
                        <span>{challenge}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled={isPending}
                onClick={() => handleImpersonate(personaId)}
              >
                View as {config.label}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
