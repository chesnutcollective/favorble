/**
 * Server-side translation helper.
 *
 * Usage (in a Server Component or server action):
 *
 *   const t = getTranslation("es");
 *   return <h1>{t("intake.header.title")}</h1>;
 *
 * Falls back to English if a key is missing in the requested locale.
 */

import {
  DEFAULT_LOCALE,
  type Locale,
  SUPPORTED_LOCALES,
  type TranslationTree,
  messages,
} from "./messages";

export type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Resolve a dotted key (e.g. "intake.step1.firstName") against a translation tree.
 * Returns `undefined` when the key does not exist (or resolves to a non-string).
 */
function resolveKey(tree: TranslationTree, key: string): string | undefined {
  const parts = key.split(".");
  let cursor: string | TranslationTree | undefined = tree;
  for (const part of parts) {
    if (cursor === undefined || typeof cursor === "string") return undefined;
    cursor = (cursor as TranslationTree)[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/**
 * Simple interpolation: replaces {name} with vars.name.
 */
function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Normalize an unknown locale value into a supported Locale, falling back to DEFAULT_LOCALE.
 */
export function resolveLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as string[]).includes(lower)
    ? (lower as Locale)
    : DEFAULT_LOCALE;
}

/**
 * Build a translator bound to a specific locale.
 *
 * Missing keys fall back to English; if still missing, the key itself is returned
 * so the UI visibly flags a missing translation in development.
 */
export function getTranslation(locale: Locale = DEFAULT_LOCALE): Translator {
  const primary = messages[locale] ?? messages[DEFAULT_LOCALE];
  const fallback = messages[DEFAULT_LOCALE];

  return (key, vars) => {
    const hit = resolveKey(primary, key) ?? resolveKey(fallback, key);
    return interpolate(hit ?? key, vars);
  };
}
