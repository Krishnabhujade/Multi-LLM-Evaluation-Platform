import { AlertTriangle, Gavel } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { seriesColor } from "@/components/shared/model-name";
import { errorLabel } from "@/components/shared/response-status";
import type { RunDetail } from "@/lib/api-types";
import { buildTraceRows } from "@/lib/chart-data";
import { formatLatency } from "@/lib/format";
import { cn } from "@/lib/utils";

const TICKS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Execution trace: every provider call attempt on a shared time axis. Candidate calls starting
 * together make the parallel fan-out visible; retries and the judging stage follow. Plain HTML,
 * so every bar's timing is also available as text (title + screen-reader label).
 */
export function TraceWaterfall({ run }: { run: RunDetail }) {
  const { rows, totalMs } = buildTraceRows(run);
  if (rows.length === 0) {
    return (
      <ChartCard title="Execution trace">
        <p className="text-sm text-muted-foreground">
          No provider calls were recorded for this run.
        </p>
      </ChartCard>
    );
  }

  const percent = (ms: number) => (totalMs > 0 ? (ms / totalMs) * 100 : 0);
  const candidateCount = rows.filter((row) => row.kind === "CANDIDATE").length;

  return (
    <ChartCard
      title="Execution trace"
      description={`${rows.length} provider calls over ${formatLatency(totalMs)} — candidate calls run in parallel, then the judge scores each response.`}
    >
      <div className="space-y-2 sm:space-y-1.5" role="list">
        <div className="grid grid-cols-1 gap-3 text-[11px] text-muted-foreground sm:grid-cols-[minmax(0,11rem)_1fr]">
          <span className="hidden sm:block" />
          <div className="relative h-4">
            {TICKS.map((tick) => (
              <span
                key={tick}
                className={cn(
                  "absolute top-0 tabular-nums",
                  tick === 1 ? "-translate-x-full" : tick > 0 && "-translate-x-1/2",
                  (tick === 0.25 || tick === 0.75) && "hidden sm:inline",
                )}
                style={{ left: `${tick * 100}%` }}
              >
                {formatLatency(totalMs * tick)}
              </span>
            ))}
          </div>
        </div>
        {rows.map((row, index) => {
          const failed = row.status === "FAILED";
          const color =
            row.kind === "JUDGE" ? "var(--muted-foreground)" : seriesColor(row.seriesIndex ?? 0);
          const start = percent(row.offsetMs);
          const end = percent(row.offsetMs + row.durationMs);
          // The timing label goes after the bar, before it, or — when neither side has room —
          // on a surface-colored pill over the bar so it stays legible on any series color.
          const placement = end <= 70 ? "after" : start >= 35 ? "before" : "inside";
          const description = `${row.kind === "JUDGE" ? `Judge ${row.label} → ${row.subject ?? "response"}` : row.label}, attempt ${row.attempt}: ${failed ? errorLabel(row.errorCode) : "ok"}, started +${formatLatency(row.offsetMs)}, took ${formatLatency(row.durationMs)}`;
          return (
            <div
              key={row.id}
              role="listitem"
              className={cn(
                "grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-center sm:gap-3",
                index === candidateCount && "mt-3 border-t pt-3",
              )}
            >
              <span className="flex min-w-0 flex-col text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  {row.kind === "JUDGE" && (
                    <Gavel className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate">
                    {row.kind === "JUDGE" ? (row.subject ?? row.label) : row.label}
                  </span>
                  {row.attempt > 1 && (
                    <span className="shrink-0 text-muted-foreground">#{row.attempt}</span>
                  )}
                </span>
                {row.kind === "JUDGE" && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    judge: {row.label}
                  </span>
                )}
              </span>
              <div className="relative h-5 rounded-sm bg-muted/40" title={description}>
                <span className="sr-only">{description}</span>
                <div
                  className={cn("absolute top-1 h-3 rounded-r-[4px]", failed && "opacity-60")}
                  style={{
                    left: `${start}%`,
                    width: `max(3px, ${percent(row.durationMs)}%)`,
                    backgroundColor: color,
                  }}
                />
                <span
                  className={cn(
                    "absolute top-0.5 flex items-center gap-1 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums",
                    placement === "after" && "pl-1.5",
                    placement === "before" && "pr-1.5",
                    placement === "inside" && "ml-1 rounded-sm bg-card/90 px-1 text-foreground",
                  )}
                  style={
                    placement === "before"
                      ? { right: `${100 - start}%` }
                      : { left: `${placement === "after" ? end : start}%` }
                  }
                >
                  {failed && <AlertTriangle className="size-3 text-status-warning" aria-hidden />}
                  {failed ? `${errorLabel(row.errorCode)} · ` : ""}
                  {formatLatency(row.durationMs)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Candidate bars use each model&apos;s color; judge calls are grey, labelled with the response
        they scored and the judge that made the call (fallback judges included). Faded bars are
        failed attempts that were retried or gave up.
      </p>
    </ChartCard>
  );
}
