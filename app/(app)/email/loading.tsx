import { Skeleton } from "@/components/ui/skeleton";

export default function EmailLoading() {
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* Email list */}
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
