import { Badge } from "@/components/ui/badge";
import type { ModelSummary } from "@/lib/api-types";
import { cn } from "@/lib/utils";

/** Categorical color for the n-th model of a run — it follows the model, never its rank. */
export function seriesColor(index: number): string {
  return `var(--series-${(index % 8) + 1})`;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] tracking-wide", className)}>
      DEMO
    </Badge>
  );
}

/** Model identity: a small series-colored dot plus the name (the text always carries identity). */
export function ModelName({
  model,
  seriesIndex,
  showProvider = true,
  className,
}: {
  model: Pick<ModelSummary, "displayName" | "providerName" | "isDemo">;
  seriesIndex?: number;
  showProvider?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {seriesIndex !== undefined && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: seriesColor(seriesIndex) }}
        />
      )}
      <span className="truncate font-medium">{model.displayName}</span>
      {showProvider && (
        <span className="shrink-0 text-xs text-muted-foreground">{model.providerName}</span>
      )}
      {model.isDemo && <DemoBadge />}
    </span>
  );
}
