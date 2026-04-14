import { Skeleton } from "@/components/ui/skeleton";

export default function CaseTasksLoading() {
  return (
    <div className="rounded-lg border">
      <div className="p-4 border-b">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
