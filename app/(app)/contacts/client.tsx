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
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Search01Icon,
	Cancel01Icon,
} from "@hugeicons/core-free-icons";

type ContactRow = {
	id: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	contactType: string;
	createdAt: string;
	caseCount: number;
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
	claimant: "Claimant",
	attorney: "Attorney",
	medical_provider: "Medical Provider",
	ssa_office: "SSA Office",
	expert: "Expert",
};

const CONTACT_TYPE_COLORS: Record<string, string> = {
	claimant: "#3b82f6",
	attorney: "#8b5cf6",
	medical_provider: "#10b981",
	ssa_office: "#f59e0b",
	expert: "#ec4899",
};

export function ContactsListClient({
	contacts,
	total,
	page,
	pageSize,
	initialSearch,
	initialType,
}: {
	contacts: ContactRow[];
	total: number;
	page: number;
	pageSize: number;
	initialSearch: string;
	initialType: string;
}) {
	const router = useRouter();
	const [search, setSearch] = useState(initialSearch);
	const [typeFilter, setTypeFilter] = useState(initialType);

	const totalPages = Math.ceil(total / pageSize);

	function applyFilters(overrides?: {
		search?: string;
		type?: string;
		page?: number;
	}) {
		const params = new URLSearchParams();
		const s = overrides?.search ?? search;
		const t = overrides?.type ?? typeFilter;
		const p = overrides?.page ?? 1;
		if (s) params.set("search", s);
		if (t) params.set("type", t);
		if (p > 1) params.set("page", String(p));
		router.push(`/contacts?${params.toString()}`);
	}

	function clearFilters() {
		setSearch("");
		setTypeFilter("");
		router.push("/contacts");
	}

	return (
		<div className="space-y-4">
			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<HugeiconsIcon
						icon={Search01Icon}
						size={16}
						className="absolute left-2.5 top-2.5 text-muted-foreground"
					/>
					<Input
						placeholder="Search by name or email..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") applyFilters();
						}}
						className="pl-9"
					/>
				</div>
				<Select
					value={typeFilter}
					onValueChange={(v) => {
						setTypeFilter(v);
						applyFilters({ type: v });
					}}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="All Types" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="claimant">Claimant</SelectItem>
						<SelectItem value="attorney">Attorney</SelectItem>
						<SelectItem value="medical_provider">
							Medical Provider
						</SelectItem>
						<SelectItem value="ssa_office">SSA Office</SelectItem>
						<SelectItem value="expert">Expert</SelectItem>
					</SelectContent>
				</Select>
				{(search || typeFilter) && (
					<Button variant="ghost" size="sm" onClick={clearFilters}>
						<HugeiconsIcon
							icon={Cancel01Icon}
							size={12}
							className="mr-1"
						/>
						Clear
					</Button>
				)}
			</div>

			{/* Table */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Phone</TableHead>
							<TableHead className="text-right">Cases</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{contacts.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="h-24 text-center text-muted-foreground"
								>
									No contacts found.
								</TableCell>
							</TableRow>
						) : (
							contacts.map((c) => (
								<TableRow key={c.id}>
									<TableCell>
										<p className="font-medium text-foreground">
											{c.lastName}, {c.firstName}
										</p>
									</TableCell>
									<TableCell>
										<Badge
											variant="outline"
											style={{
												borderColor:
													CONTACT_TYPE_COLORS[
														c.contactType
													] ?? undefined,
												color:
													CONTACT_TYPE_COLORS[
														c.contactType
													] ?? undefined,
											}}
										>
											{CONTACT_TYPE_LABELS[
												c.contactType
											] ?? c.contactType}
										</Badge>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{c.email ?? "-"}
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{c.phone ?? "-"}
									</TableCell>
									<TableCell className="text-right text-sm text-muted-foreground">
										{c.caseCount}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{total} total contact{total !== 1 ? "s" : ""}
				</p>
				{totalPages > 1 && (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => applyFilters({ page: page - 1 })}
						>
							<HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
						</Button>
						<span className="text-sm text-muted-foreground">
							Page {page} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages}
							onClick={() => applyFilters({ page: page + 1 })}
						>
							<HugeiconsIcon
								icon={ArrowRight01Icon}
								size={16}
							/>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
