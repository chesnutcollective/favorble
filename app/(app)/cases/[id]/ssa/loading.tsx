import { Skeleton } from "@/components/ui/skeleton";

export default function CaseSsaLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-40" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
