"use client";

import { useTheme, type ThemeSkin } from "@/lib/theme";

const options: { value: ThemeSkin; label: string }[] = [
  { value: "vercel", label: "Vercel" },
  { value: "apple", label: "Apple" },
];

export function ThemeSwitcher() {
  const { skin, setSkin } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSkin(opt.value)}
          className={`rounded-sm px-3 py-1 text-xs font-medium transition-all ${
            skin === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
