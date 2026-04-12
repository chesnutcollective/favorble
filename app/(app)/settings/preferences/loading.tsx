import { Skeleton } from "@/components/ui/skeleton";

export default function PreferencesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}
