import { cn } from "@/lib/utils";

/**
 * A score meter: single-hue fill on a lighter track of the same ramp, so magnitude reads across
 * the whole bar. The numeric value is always rendered as text beside it by the caller.
 */
export function ScoreMeter({
  score,
  max = 10,
  label,
  className,
}: {
  score: number | null;
  max?: number;
  label: string;
  className?: string;
}) {
  const percent = score === null ? 0 : Math.max(0, Math.min(1, score / max)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={score ?? undefined}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-viz-track", className)}
    >
      <div
        className="h-full rounded-full bg-viz-accent transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
