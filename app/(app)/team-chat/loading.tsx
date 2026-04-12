import { Skeleton } from "@/components/ui/skeleton";

export default function TeamChatLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="grid grid-cols-[280px_1fr] gap-4 rounded-lg border overflow-hidden">
        <div className="border-r p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-md p-2 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
