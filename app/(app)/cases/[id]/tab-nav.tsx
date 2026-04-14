"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type TabDef = {
  label: string;
  segment: string;
};

const tabs: TabDef[] = [
  { label: "Overview", segment: "overview" },
  { label: "Documents", segment: "documents" },
  { label: "Fields", segment: "fields" },
  { label: "Activity", segment: "activity" },
  { label: "Messages", segment: "messages" },
  { label: "Team Chat", segment: "team-chat" },
  { label: "Tasks", segment: "tasks" },
  { label: "Automation", segment: "automation" },
  { label: "Calendar", segment: "calendar" },
  { label: "SSA Data", segment: "ssa" },
  { label: "Chronology", segment: "chronology" },
];

export function CaseTabNav({ caseId }: { caseId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-[#EAEAEA] overflow-x-auto bg-background -mx-3 px-3 sm:mx-0 sm:px-0 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const href = `/cases/${caseId}/${tab.segment}`;
        const isActive = pathname.endsWith(`/${tab.segment}`);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              "px-2.5 sm:px-3 py-2.5 sm:py-2 text-[13px] sm:text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors duration-200 min-h-[44px] sm:min-h-0 flex items-center",
              isActive
                ? "border-black text-foreground"
                : "border-transparent text-[#666] hover:text-foreground hover:border-[#CCC]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
