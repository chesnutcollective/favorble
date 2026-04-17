import { CommandPalette } from "@/components/search/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-[var(--border-default)] pl-4 pr-6 sm:pl-6 sm:pr-8 lg:pl-8 lg:pr-10">
      <CommandPalette />
      <ThemeToggle />
    </header>
  );
}
