"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  createElement,
} from "react";

export type ThemeSkin = "vercel" | "apple";

const ThemeContext = createContext<{
  skin: ThemeSkin;
  setSkin: (skin: ThemeSkin) => void;
}>({ skin: "vercel", setSkin: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<ThemeSkin>("vercel");

  useEffect(() => {
    const saved = localStorage.getItem("favorble-skin") as ThemeSkin | null;
    if (saved && (saved === "vercel" || saved === "apple")) {
      setSkinState(saved);
    }
  }, []);

  const setSkin = (newSkin: ThemeSkin) => {
    setSkinState(newSkin);
    localStorage.setItem("favorble-skin", newSkin);
    document.documentElement.setAttribute("data-skin", newSkin);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-skin", skin);
  }, [skin]);

  return createElement(
    ThemeContext.Provider,
    { value: { skin, setSkin } },
    children,
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
