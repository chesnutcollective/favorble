import { Skeleton } from "@/components/ui/skeleton";

export default function CaseFieldsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-48 rounded-md" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
