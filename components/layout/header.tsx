import { GlobalSearch } from "@/components/layout/global-search";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-[var(--border-default)] px-8">
      {/* TODO: Mobile hamburger menu button for < 1024px screens */}
      <GlobalSearch />
    </header>
  );
}
