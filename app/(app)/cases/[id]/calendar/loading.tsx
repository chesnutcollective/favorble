import { Skeleton } from "@/components/ui/skeleton";

export default function CaseCalendarLoading() {
  return (
    <div className="rounded-lg border">
      <div className="p-4 border-b">
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 rounded-md border p-3">
            <div className="space-y-1 shrink-0">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-5 w-6" />
            </div>
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
