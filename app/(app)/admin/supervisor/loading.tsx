import { Skeleton } from "@/components/ui/skeleton";

export default function SupervisorHubLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-8 w-12" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="rounded-lg border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
