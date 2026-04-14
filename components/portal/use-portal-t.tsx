"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getTranslation, type Translator } from "@/lib/i18n/getTranslation";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";

/**
 * Portal-local i18n context.
 *
 * Wave 1 handled locale persistence via `setPortalLocale` + the contact row.
 * Wave 2 hydrates this context from the server layout so client components
 * inside the portal can render translated strings without each one having to
 * fetch the locale independently.
 *
 *   "use client";
 *   import { usePortalT } from "@/components/portal/use-portal-t";
 *
 *   export function Foo() {
 *     const { t, locale } = usePortalT();
 *     return <p>{t("portal.home.whatsHappening")}</p>;
 *   }
 */
type PortalLocaleContextValue = {
  locale: Locale;
  t: Translator;
};

const PortalLocaleContext = createContext<PortalLocaleContextValue | null>(
  null,
);

function normalize(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase().split(/[-_]/)[0];
  return lower === "es" ? "es" : "en";
}

export function PortalLocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const normalized = normalize(locale);
  const value = useMemo<PortalLocaleContextValue>(
    () => ({
      locale: normalized,
      t: getTranslation(normalized),
    }),
    [normalized],
  );
  return (
    <PortalLocaleContext.Provider value={value}>
      {children}
    </PortalLocaleContext.Provider>
  );
}

/**
 * Portal-only translator. Falls back to English if no provider is present so
 * misuse never hard-crashes.
 */
export function usePortalT(): PortalLocaleContextValue {
  const ctx = useContext(PortalLocaleContext);
  if (ctx) return ctx;
  return { locale: DEFAULT_LOCALE, t: getTranslation(DEFAULT_LOCALE) };
}
