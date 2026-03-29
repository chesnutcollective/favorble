"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Folder01Icon,
  TextField,
  Activity01Icon,
  Message01Icon,
  Task01Icon,
  Calendar01Icon,
  GlobeIcon,
  Stethoscope02Icon,
} from "@hugeicons/core-free-icons";

type TabDef = {
  label: string;
  segment: string;
  icon: IconSvgElement;
  group: "core" | "comms" | "data";
};

const tabs: TabDef[] = [
  {
    label: "Overview",
    segment: "overview",
    icon: DashboardSquare01Icon,
    group: "core",
  },
  {
    label: "Documents",
    segment: "documents",
    icon: Folder01Icon,
    group: "core",
  },
  { label: "Fields", segment: "fields", icon: TextField, group: "core" },
  {
    label: "Activity",
    segment: "activity",
    icon: Activity01Icon,
    group: "comms",
  },
  {
    label: "Messages",
    segment: "messages",
    icon: Message01Icon,
    group: "comms",
  },
  { label: "Tasks", segment: "tasks", icon: Task01Icon, group: "comms" },
  {
    label: "Calendar",
    segment: "calendar",
    icon: Calendar01Icon,
    group: "comms",
  },
  { label: "SSA Data", segment: "ssa", icon: GlobeIcon, group: "data" },
  {
    label: "Chronology",
    segment: "chronology",
    icon: Stethoscope02Icon,
    group: "data",
  },
];

// Group boundaries: insert a visual separator before these segments
const groupStarts = new Set(["activity", "ssa"]);

export function CaseTabNav({ caseId }: { caseId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-0.5 border-b border-border/60 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] overflow-x-auto bg-background">
      {tabs.map((tab) => {
        const href = `/cases/${caseId}/${tab.segment}`;
        const isActive = pathname.endsWith(`/${tab.segment}`);
        const showSep = groupStarts.has(tab.segment);
        return (
          <div key={tab.segment} className="flex items-center">
            {showSep && <div className="mx-1 h-5 w-px bg-border/60" />}
            <Link
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors rounded-t-sm",
                isActive
                  ? "border-blue-600 text-primary bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50",
              )}
            >
              <HugeiconsIcon
                icon={tab.icon}
                size={15}
                className={cn(
                  "shrink-0",
                  isActive ? "text-blue-600" : "text-muted-foreground/70",
                )}
              />
              {tab.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
