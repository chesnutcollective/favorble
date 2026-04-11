import { CommandPalette } from "@/components/search/command-palette";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-[var(--border-default)] px-4 sm:px-6 lg:px-8">
      <CommandPalette />
    </header>
  );
}
