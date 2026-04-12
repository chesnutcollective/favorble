import { Skeleton } from "@/components/ui/skeleton";

export default function WorkloadLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="rounded-lg border p-4 space-y-3">
                <Skeleton className="h-5 w-28 rounded" />
                {Array.from({ length: 3 }).map((_, k) => (
                  <div key={k} className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
