import { Skeleton } from "@/components/ui/skeleton";

export default function PhiWriterLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border">
        <div className="flex gap-4 border-b px-4 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
