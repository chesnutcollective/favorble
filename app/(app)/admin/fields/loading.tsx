import { Skeleton } from "@/components/ui/skeleton";

export default function FieldsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg border">
          <div className="p-4 border-b">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
