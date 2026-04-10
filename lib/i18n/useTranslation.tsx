"use client";

/**
 * Client-side translation hook.
 *
 * Usage:
 *
 *   "use client";
 *   import { useTranslation } from "@/lib/i18n/useTranslation";
 *
 *   export function MyForm() {
 *     const { t, locale, setLocale } = useTranslation();
 *     return <label>{t("intake.step1.firstName")}</label>;
 *   }
 *
 * The provider (`I18nProvider`) reads an initial locale from:
 *   1. the `?lang=` URL search param
 *   2. `localStorage.favorble_locale`
 *   3. the browser `navigator.language`
 *   4. DEFAULT_LOCALE ("en")
 */

import * as React from "react";
import {
  DEFAULT_LOCALE,
  type Locale,
  SUPPORTED_LOCALES,
} from "./messages";
import { getTranslation, type Translator, resolveLocale } from "./getTranslation";

const STORAGE_KEY = "favorble_locale";
const URL_PARAM = "lang";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function readInitialLocale(preferred?: Locale): Locale {
  if (preferred) return preferred;
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(URL_PARAM);
    if (fromUrl) return resolveLocale(fromUrl);
  } catch {
    // ignore
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return resolveLocale(stored);
  } catch {
    // ignore
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return resolveLocale(navigator.language);
  }

  return DEFAULT_LOCALE;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(
    () => initialLocale ?? DEFAULT_LOCALE,
  );

  // After mount, reconcile with URL / localStorage / navigator on the client.
  // Runs exactly once on mount; safe to ignore re-reconciliation.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const resolved = readInitialLocale(initialLocale);
    setLocaleState((prev) => (resolved !== prev ? resolved : prev));
  }, [initialLocale]);

  const setLocale = React.useCallback((next: Locale) => {
    if (!(SUPPORTED_LOCALES as string[]).includes(next)) return;
    setLocaleState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
        const url = new URL(window.location.href);
        url.searchParams.set(URL_PARAM, next);
        window.history.replaceState(null, "", url.toString());
      } catch {
        // ignore
      }
    }
  }, []);

  const t = React.useMemo(() => getTranslation(locale), [locale]);

  const value = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (ctx) return ctx;

  // Fallback: allow the hook to work outside a provider, with a frozen English translator.
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: getTranslation(DEFAULT_LOCALE),
  };
}
