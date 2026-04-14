import { Skeleton } from "@/components/ui/skeleton";

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
