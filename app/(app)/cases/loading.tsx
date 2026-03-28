import { Skeleton } from "@/components/ui/skeleton";

export default function CasesLoading() {
	return (
		<div className="space-y-4">
			{/* Page header */}
			<div className="flex items-start justify-between">
				<div>
					<Skeleton className="h-8 w-24" />
					<Skeleton className="mt-2 h-4 w-56" />
				</div>
				<Skeleton className="h-9 w-28 rounded-md" />
			</div>

			{/* Filters row */}
			<div className="flex gap-3">
				<Skeleton className="h-10 w-64 rounded-md" />
				<Skeleton className="h-10 w-36 rounded-md" />
				<Skeleton className="h-10 w-36 rounded-md" />
			</div>

			{/* Table skeleton */}
			<div className="rounded-lg border">
				{/* Header */}
				<div className="flex gap-4 border-b px-4 py-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-4 flex-1" />
					))}
				</div>
				{/* Rows */}
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
						{Array.from({ length: 5 }).map((_, j) => (
							<Skeleton key={j} className="h-4 flex-1" />
						))}
					</div>
				))}
			</div>
		</div>
	);
}
