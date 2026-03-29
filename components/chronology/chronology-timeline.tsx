"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChronologyEntryItem } from "@/app/(app)/cases/[id]/chronology/client";

const ENTRY_TYPE_COLORS: Record<string, { dot: string; label: string }> = {
	office_visit: {
		dot: "bg-blue-500",
		label: "bg-blue-100 text-blue-800",
	},
	hospitalization: {
		dot: "bg-red-500",
		label: "bg-red-100 text-red-800",
	},
	emergency: {
		dot: "bg-orange-500",
		label: "bg-orange-100 text-orange-800",
	},
	lab_result: {
		dot: "bg-green-500",
		label: "bg-green-100 text-green-800",
	},
	imaging: {
		dot: "bg-purple-500",
		label: "bg-purple-100 text-purple-800",
	},
	mental_health: {
		dot: "bg-indigo-500",
		label: "bg-indigo-100 text-indigo-800",
	},
	physical_therapy: {
		dot: "bg-cyan-500",
		label: "bg-cyan-100 text-cyan-800",
	},
	surgery: {
		dot: "bg-red-600",
		label: "bg-red-100 text-red-800",
	},
	prescription: {
		dot: "bg-teal-500",
		label: "bg-teal-100 text-teal-800",
	},
	diagnosis: {
		dot: "bg-yellow-500",
		label: "bg-yellow-100 text-yellow-800",
	},
	functional_assessment: {
		dot: "bg-amber-500",
		label: "bg-amber-100 text-amber-800",
	},
	other: {
		dot: "bg-gray-400",
		label: "bg-gray-100 text-gray-800",
	},
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
	office_visit: "Office Visit",
	hospitalization: "Hospitalization",
	emergency: "Emergency",
	lab_result: "Lab Result",
	imaging: "Imaging",
	mental_health: "Mental Health",
	physical_therapy: "Physical Therapy",
	surgery: "Surgery",
	prescription: "Prescription",
	diagnosis: "Diagnosis",
	functional_assessment: "Functional Assessment",
	other: "Other",
};

type ChronologyTimelineProps = {
	entries: ChronologyEntryItem[];
	onEdit?: (entry: ChronologyEntryItem) => void;
};

export function ChronologyTimeline({
	entries,
	onEdit,
}: ChronologyTimelineProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpanded = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<div className="relative ml-4">
			{/* Vertical line */}
			<div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

			<div className="space-y-0">
				{entries.map((entry, index) => {
					const isExpanded = expandedIds.has(entry.id);
					const colors =
						ENTRY_TYPE_COLORS[entry.entryType] ??
						ENTRY_TYPE_COLORS.other;

					return (
						<div
							key={entry.id}
							className={cn(
								"relative pl-8 pb-6",
								entry.isExcluded && "opacity-50",
							)}
						>
							{/* Dot */}
							<div
								className={cn(
									"absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background",
									colors.dot,
								)}
							/>

							{/* Content */}
							<div className="rounded-lg border bg-card p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-xs font-medium text-muted-foreground">
												{entry.eventDate
													? new Date(
															entry.eventDate,
														).toLocaleDateString(
															"en-US",
															{
																year: "numeric",
																month: "short",
																day: "numeric",
															},
														)
													: "No date"}
											</span>
											<Badge
												className={cn(
													"text-xs",
													colors.label,
												)}
											>
												{ENTRY_TYPE_LABELS[
													entry.entryType
												] ?? entry.entryType}
											</Badge>
											{entry.isVerified && (
												<Badge
													variant="outline"
													className="text-xs text-green-700 border-green-300"
												>
													Verified
												</Badge>
											)}
											{entry.isExcluded && (
												<Badge
													variant="outline"
													className="text-xs text-muted-foreground"
												>
													Excluded
												</Badge>
											)}
										</div>

										{entry.providerName && (
											<p className="mt-1 text-sm font-medium text-foreground">
												{entry.providerName}
												{entry.facilityName && (
													<span className="font-normal text-muted-foreground">
														{" "}
														at{" "}
														{entry.facilityName}
													</span>
												)}
											</p>
										)}

										<p className="mt-1 text-sm text-foreground">
											{entry.summary}
										</p>

										{/* Expanded details */}
										{isExpanded && (
											<div className="mt-3 space-y-2">
												{entry.details && (
													<div>
														<p className="text-xs font-medium text-muted-foreground">
															Details
														</p>
														<p className="text-sm text-foreground">
															{entry.details}
														</p>
													</div>
												)}
												{entry.diagnoses &&
													entry.diagnoses.length >
														0 && (
														<div>
															<p className="text-xs font-medium text-muted-foreground">
																Diagnoses
															</p>
															<div className="flex flex-wrap gap-1 mt-1">
																{entry.diagnoses.map(
																	(
																		d,
																		i,
																	) => (
																		<Badge
																			key={
																				i
																			}
																			variant="secondary"
																			className="text-xs"
																		>
																			{d}
																		</Badge>
																	),
																)}
															</div>
														</div>
													)}
												{entry.treatments &&
													entry.treatments.length >
														0 && (
														<div>
															<p className="text-xs font-medium text-muted-foreground">
																Treatments
															</p>
															<div className="flex flex-wrap gap-1 mt-1">
																{entry.treatments.map(
																	(
																		t,
																		i,
																	) => (
																		<Badge
																			key={
																				i
																			}
																			variant="secondary"
																			className="text-xs"
																		>
																			{t}
																		</Badge>
																	),
																)}
															</div>
														</div>
													)}
												{entry.medications &&
													entry.medications.length >
														0 && (
														<div>
															<p className="text-xs font-medium text-muted-foreground">
																Medications
															</p>
															<div className="flex flex-wrap gap-1 mt-1">
																{entry.medications.map(
																	(
																		m,
																		i,
																	) => (
																		<Badge
																			key={
																				i
																			}
																			variant="secondary"
																			className="text-xs"
																		>
																			{m}
																		</Badge>
																	),
																)}
															</div>
														</div>
													)}
											</div>
										)}
									</div>

									<div className="flex items-center gap-1 shrink-0">
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												toggleExpanded(entry.id)
											}
										>
											{isExpanded
												? "Collapse"
												: "Expand"}
										</Button>
										{onEdit && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => onEdit(entry)}
											>
												Edit
											</Button>
										)}
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
