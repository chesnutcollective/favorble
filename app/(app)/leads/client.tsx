"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateLeadStatus } from "@/app/actions/leads";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Mail01Icon, Call02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

type Lead = {
	id: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	source: string | null;
	createdAt: string;
	notes: string | null;
};

type Column = {
	status: string;
	label: string;
	count: number;
	leads: Lead[];
};

function formatRelative(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const hours = Math.floor(diff / 3600000);
	if (hours < 1) return "< 1h ago";
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(diff / 86400000);
	return `${days}d ago`;
}

export function LeadsPipelineClient({
	columns,
}: {
	columns: Column[];
}) {
	const [, startTransition] = useTransition();

	function handleMoveRight(leadId: string, currentStatus: string) {
		const currentIndex = columns.findIndex((c) => c.status === currentStatus);
		if (currentIndex < columns.length - 1) {
			const nextStatus = columns[currentIndex + 1].status;
			startTransition(async () => {
				await updateLeadStatus(leadId, nextStatus);
			});
		}
	}

	return (
		<div className="flex gap-4 overflow-x-auto pb-4">
			{columns.map((col) => (
				<div
					key={col.status}
					className="min-w-[280px] max-w-[320px] flex-1"
				>
					{/* Column Header */}
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-sm font-medium text-foreground">
							{col.label}
						</h3>
						<Badge variant="secondary" className="text-xs">
							{col.leads.length}
						</Badge>
					</div>

					{/* Cards */}
					<div className="space-y-2">
						{col.leads.map((lead) => (
							<Card key={lead.id} className="hover:shadow-sm transition-shadow">
								<CardContent className="p-3 space-y-2">
									<div className="flex items-start justify-between">
										<Link
											href={`/leads/${lead.id}`}
											className="text-sm font-medium text-foreground hover:text-primary"
										>
											{lead.firstName} {lead.lastName}
										</Link>
										<span className="text-xs text-muted-foreground">
											{formatRelative(lead.createdAt)}
										</span>
									</div>
									<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
										{lead.email && (
											<span className="flex items-center gap-1">
												<HugeiconsIcon icon={Mail01Icon} size={12} />
												{lead.email}
											</span>
										)}
										{lead.phone && (
											<span className="flex items-center gap-1">
												<HugeiconsIcon icon={Call02Icon} size={12} />
												{lead.phone}
											</span>
										)}
									</div>
									{lead.source && (
										<Badge variant="outline" className="text-xs">
											{lead.source}
										</Badge>
									)}
									<div className="flex justify-end">
										<Button
											variant="ghost"
											size="sm"
											className="h-6 text-xs"
											onClick={() =>
												handleMoveRight(
													lead.id,
													col.status,
												)
											}
										>
											<HugeiconsIcon icon={ArrowRight01Icon} size={12} className="mr-1" />
											Advance
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
						{col.leads.length === 0 && (
							<div className="rounded-md border border-dashed p-6 text-center">
								<p className="text-xs text-muted-foreground">No leads</p>
							</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
