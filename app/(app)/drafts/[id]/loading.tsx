import { Skeleton } from "@/components/ui/skeleton";

export default function DraftDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-20" />
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-64 w-full rounded" />
        <div className="flex gap-2 justify-end">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
