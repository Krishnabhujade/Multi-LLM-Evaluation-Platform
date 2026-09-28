import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading evaluation">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
