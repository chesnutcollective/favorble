import { Skeleton } from "@/components/ui/skeleton";

export default function StyleguideLoading() {
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  );
}
