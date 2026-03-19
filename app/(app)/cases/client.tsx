"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";

type CaseRow = {
	id: string;
	caseNumber: string;
	status: string;
	currentStageId: string;
	stageName: string | null;
	stageCode: string | null;
	stageGroupId: string | null;
	stageGroupName: string | null;
	stageGroupColor: string | null;
	ssaOffice: string | null;
	createdAt: string;
	updatedAt: string;
	claimant: { firstName: string; lastName: string } | null;
	assignedStaff: {
		userId: string;
		firstName: string;
		lastName: string;
		role: string;
	}[];
};

type Stage = {
	id: string;
	name: string;
	code: string;
	stageGroupId: string;
	owningTeam: string | null;
	isInitial: boolean;
	isTerminal: boolean;
};

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diff = now - then;
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (hours < 1) return "< 1h";
	if (hours < 24) return `${hours}h`;
	if (days < 30) return `${days}d`;
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export function CasesListClient({
	cases,
	total,
	page,
	pageSize,
	stages,
	initialSearch,
	initialStageId,
}: {
	cases: CaseRow[];
	total: number;
	page: number;
	pageSize: number;
	stages: Stage[];
	initialSearch: string;
	initialStageId: string;
}) {
	const router = useRouter();
	const [search, setSearch] = useState(initialSearch);
	const [stageFilter, setStageFilter] = useState(initialStageId);

	const totalPages = Math.ceil(total / pageSize);

	function applyFilters(overrides?: {
		search?: string;
		stage?: string;
		page?: number;
	}) {
		const params = new URLSearchParams();
		const s = overrides?.search ?? search;
		const st = overrides?.stage ?? stageFilter;
		const p = overrides?.page ?? 1;
		if (s) params.set("search", s);
		if (st) params.set("stage", st);
		if (p > 1) params.set("page", String(p));
		router.push(`/cases?${params.toString()}`);
	}

	function clearFilters() {
		setSearch("");
		setStageFilter("");
		router.push("/cases");
	}

	return (
		<div className="space-y-4">
			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
					<Input
						placeholder="Search cases..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") applyFilters();
						}}
						className="pl-9"
					/>
				</div>
				<Select
					value={stageFilter}
					onValueChange={(v) => {
						setStageFilter(v);
						applyFilters({ stage: v });
					}}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="All Stages" />
					</SelectTrigger>
					<SelectContent>
						{stages.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.code} - {s.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{(search || stageFilter) && (
					<Button variant="ghost" size="sm" onClick={clearFilters}>
						<X className="mr-1 h-3 w-3" />
						Clear
					</Button>
				)}
			</div>

			{/* Table */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Claimant</TableHead>
							<TableHead>Stage</TableHead>
							<TableHead>Assigned To</TableHead>
							<TableHead>Last Activity</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{cases.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={4}
									className="h-24 text-center text-gray-500"
								>
									No cases found.
								</TableCell>
							</TableRow>
						) : (
							cases.map((c) => (
								<TableRow key={c.id} className="cursor-pointer hover:bg-gray-50">
									<TableCell>
										<Link
											href={`/cases/${c.id}`}
											className="block"
										>
											<p className="font-medium text-gray-900">
												{c.claimant
													? `${c.claimant.lastName}, ${c.claimant.firstName}`
													: "Unknown"}
											</p>
											<p className="text-xs text-gray-500">
												{c.caseNumber}
											</p>
										</Link>
									</TableCell>
									<TableCell>
										{c.stageName && (
											<Badge
												variant="outline"
												style={{
													borderColor:
														c.stageGroupColor ??
														undefined,
													color:
														c.stageGroupColor ??
														undefined,
												}}
											>
												{c.stageName}
											</Badge>
										)}
									</TableCell>
									<TableCell>
										{c.assignedStaff.length > 0 ? (
											<span className="text-sm text-gray-700">
												{c.assignedStaff
													.map(
														(a) =>
															`${a.firstName} ${a.lastName[0]}.`,
													)
													.join(", ")}
											</span>
										) : (
											<span className="text-sm text-gray-400">
												Unassigned
											</span>
										)}
									</TableCell>
									<TableCell className="text-sm text-gray-500">
										{formatRelativeTime(c.updatedAt)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-gray-600">
					{total} total case{total !== 1 ? "s" : ""}
				</p>
				{totalPages > 1 && (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => applyFilters({ page: page - 1 })}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-sm text-gray-600">
							Page {page} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages}
							onClick={() => applyFilters({ page: page + 1 })}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
