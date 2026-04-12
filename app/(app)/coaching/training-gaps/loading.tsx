import { Skeleton } from "@/components/ui/skeleton";

export default function TrainingGapsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="rounded-lg border">
            <div className="flex gap-4 border-b px-4 py-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
                {Array.from({ length: 4 }).map((_, k) => (
                  <Skeleton key={k} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
