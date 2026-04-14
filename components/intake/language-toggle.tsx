"use client";

/**
 * Pill-style EN / ES language toggle for the public intake flow.
 *
 * Reads and writes its value via the `useTranslation` hook (which in turn
 * persists the choice to localStorage and the `?lang=` URL param).
 *
 * Brand accent when active: #263c94
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Locale } from "@/lib/i18n/messages";

type LanguageToggleProps = {
  className?: string;
};

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
];

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={t("common.languageToggle")}
    >
      <span className="sr-only">{t("common.languageToggle")}</span>
      <div
        role="radiogroup"
        aria-label={t("common.languageToggle")}
        className="inline-flex rounded-full border border-border bg-white p-0.5 shadow-sm"
      >
        {OPTIONS.map((opt) => {
          const active = locale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLocale(opt.value)}
              className={cn(
                "min-w-[44px] rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-colors duration-200",
                active
                  ? "bg-[#263c94] text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
