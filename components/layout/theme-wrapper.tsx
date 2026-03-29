"use client";

import { ThemeProvider } from "@/lib/theme";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
