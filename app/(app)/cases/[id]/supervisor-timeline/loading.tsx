import { Skeleton } from "@/components/ui/skeleton";

export default function SupervisorTimelineLoading() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
