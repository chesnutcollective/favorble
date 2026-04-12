import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px border-b">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-2">
              <Skeleton className="h-4 w-8 mx-auto" />
            </div>
          ))}
        </div>
        {/* Week rows */}
        {Array.from({ length: 5 }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-7 gap-px border-b last:border-b-0"
          >
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="min-h-24 p-2 space-y-1">
                <Skeleton className="h-4 w-6" />
                {(row + col) % 3 === 0 && (
                  <Skeleton className="h-5 w-full rounded" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
