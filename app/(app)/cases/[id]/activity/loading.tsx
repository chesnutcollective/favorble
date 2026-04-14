import { Skeleton } from "@/components/ui/skeleton";

export default function CaseActivityLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-20 w-full rounded" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div className="rounded-lg border p-4">
        <Skeleton className="h-5 w-28 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
