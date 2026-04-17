"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ORDER: readonly ThemeMode[] = ["light", "dark", "system"] as const;

const ICONS: Record<ThemeMode, typeof Sun03Icon> = {
  light: Sun03Icon,
  dark: Moon02Icon,
  system: ComputerIcon,
};

const LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Theme toggle: cycles through light → dark → system on click. Renders a
 * deterministic placeholder (`system` icon) until hydrated so the server HTML
 * and first client render match — prevents hydration mismatches when the
 * persisted preference differs from `system`.
 *
 * Variant:
 *   - "icon": icon-only pill (header / user menu footer)
 *   - "segmented": three-button segmented control (settings surfaces, styleguide)
 */
export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "segmented";
  className?: string;
}) {
  const { mode, setMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const displayMode: ThemeMode = mounted ? mode : "system";

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Theme"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5",
          className,
        )}
      >
        {ORDER.map((opt) => {
          const Icon = ICONS[opt];
          const selected = displayMode === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={LABELS[opt]}
              title={LABELS[opt]}
              onClick={() => setMode(opt)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={Icon} size={14} aria-hidden="true" />
              <span>{LABELS[opt]}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = ICONS[displayMode];
  const nextIndex = (ORDER.indexOf(displayMode) + 1) % ORDER.length;
  const nextMode = ORDER[nextIndex];

  return (
    <button
      type="button"
      onClick={() => setMode(nextMode)}
      aria-label={`Theme: ${LABELS[displayMode]}. Click to switch to ${LABELS[nextMode]}.`}
      title={`Theme: ${LABELS[displayMode]}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
    >
      <HugeiconsIcon icon={Icon} size={16} aria-hidden="true" />
    </button>
  );
}
