"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
	{ label: "Overview", segment: "overview" },
	{ label: "Documents", segment: "documents" },
	{ label: "Fields", segment: "fields" },
	{ label: "Activity", segment: "activity" },
	{ label: "Messages", segment: "messages" },
	{ label: "Tasks", segment: "tasks" },
	{ label: "Calendar", segment: "calendar" },
	{ label: "SSA Data", segment: "ssa" },
];

export function CaseTabNav({ caseId }: { caseId: string }) {
	const pathname = usePathname();

	return (
		<nav className="flex gap-1 border-b overflow-x-auto">
			{tabs.map((tab) => {
				const href = `/cases/${caseId}/${tab.segment}`;
				const isActive = pathname.endsWith(`/${tab.segment}`);
				return (
					<Link
						key={tab.segment}
						href={href}
						className={cn(
							"px-3 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors",
							isActive
								? "border-blue-600 text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
						)}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
