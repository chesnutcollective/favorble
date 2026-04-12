import { Skeleton } from "@/components/ui/skeleton";

export default function ContactDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
