import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading history">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-9 w-full max-w-md" />
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
