import { Skeleton } from "@/components/ui/skeleton";

export default function WorkflowsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64" />
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-24 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
