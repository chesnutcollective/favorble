"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  createElement,
} from "react";

export type ThemeSkin = "vercel" | "apple";
export type ThemeMode = "light" | "dark" | "system";

export const THEME_COOKIE = "ttn-theme";
export const THEME_STORAGE_KEY = "favorble-theme";
const SKIN_STORAGE_KEY = "favorble-skin";

const MODE_VALUES: readonly ThemeMode[] = ["light", "dark", "system"] as const;
const SKIN_VALUES: readonly ThemeSkin[] = ["vercel", "apple"] as const;

function isMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (MODE_VALUES as readonly string[]).includes(value);
}

function isSkin(value: unknown): value is ThemeSkin {
  return typeof value === "string" && (SKIN_VALUES as readonly string[]).includes(value);
}

type ThemeContextValue = {
  skin: ThemeSkin;
  setSkin: (skin: ThemeSkin) => void;
  /** Persisted user preference (light, dark, or system). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The mode currently applied to the DOM after resolving "system". */
  resolvedMode: Exclude<ThemeMode, "system">;
};

const ThemeContext = createContext<ThemeContextValue>({
  skin: "vercel",
  setSkin: () => {},
  mode: "system",
  setMode: () => {},
  resolvedMode: "light",
});

function writeCookie(name: string, value: string) {
  // 1 year; SameSite=Lax so it survives normal navigation.
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function applyDomMode(mode: ThemeMode): Exclude<ThemeMode, "system"> {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved: Exclude<ThemeMode, "system"> =
    mode === "system" ? (prefersDark ? "dark" : "light") : mode;

  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<ThemeSkin>("vercel");
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedMode, setResolvedMode] =
    useState<Exclude<ThemeMode, "system">>("light");

  // Hydrate from storage once. The inline SSR script in app/layout.tsx already
  // applied the correct class to <html> before React mounted, so this just
  // syncs React state — no flash.
  useEffect(() => {
    try {
      const savedSkin = localStorage.getItem(SKIN_STORAGE_KEY);
      if (isSkin(savedSkin)) setSkinState(savedSkin);

      const savedMode = localStorage.getItem(THEME_STORAGE_KEY);
      const initialMode: ThemeMode = isMode(savedMode) ? savedMode : "system";
      setModeState(initialMode);
      setResolvedMode(applyDomMode(initialMode));
    } catch {
      // localStorage can throw in privacy mode — ignore, leave defaults.
    }
  }, []);

  // Watch OS preference while mode === "system".
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (modeRef.current === "system") {
        setResolvedMode(applyDomMode("system"));
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Apply skin to DOM.
  useEffect(() => {
    document.documentElement.setAttribute("data-skin", skin);
  }, [skin]);

  const setSkin = useCallback((nextSkin: ThemeSkin) => {
    setSkinState(nextSkin);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, nextSkin);
    } catch {
      // localStorage may be unavailable (privacy mode, SSR) — ignore.
    }
    document.documentElement.setAttribute("data-skin", nextSkin);
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextMode);
      writeCookie(THEME_COOKIE, nextMode);
    } catch {
      // localStorage / document.cookie may be unavailable — ignore.
    }
    setResolvedMode(applyDomMode(nextMode));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ skin, setSkin, mode, setMode, resolvedMode }),
    [skin, setSkin, mode, setMode, resolvedMode],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
