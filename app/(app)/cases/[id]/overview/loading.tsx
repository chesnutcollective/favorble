import { Skeleton } from "@/components/ui/skeleton";

export default function CaseOverviewLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-32 w-full rounded" />
      </div>
    </div>
  );
}
