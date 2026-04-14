import { Skeleton } from "@/components/ui/skeleton";

export default function CallDetailLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-3 w-12 shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
