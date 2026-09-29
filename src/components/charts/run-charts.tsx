"use client";

import { ChartCard } from "@/components/charts/chart-card";
import { ScoreRadar } from "@/components/charts/score-radar";
import { TokenBars } from "@/components/charts/token-bars";
import { ValueBars } from "@/components/charts/value-bars";
import { ModelName } from "@/components/shared/model-name";
import { ResponseStatusLabel } from "@/components/shared/response-status";
import type { RunDetail } from "@/lib/api-types";
import { buildLatencyBars, buildOverallBars, buildTokenBars } from "@/lib/chart-data";
import { formatLatency, formatScore } from "@/lib/format";

/** The Charts tab: scores, latency and token usage. The comparison table is the table view. */
export function RunCharts({ run }: { run: RunDetail }) {
  const overall = buildOverallBars(run);
  const latency = buildLatencyBars(run);
  const tokens = buildTokenBars(run);
  const byId = new Map(run.responses.map((response) => [response.id, response]));

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <ScoreRadar run={run} />

      <ChartCard title="Overall score" description="Weighted score out of 10, best first.">
        {overall.length > 0 ? (
          <ValueBars
            bars={overall}
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tickFormat={(value) => String(value)}
            format={(value) => formatScore(value)}
            valueLabel="/ 10"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No response was scored.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Latency"
        description="Wall-clock time per model, including retries. Fastest first."
      >
        {latency.bars.length > 0 && (
          <ValueBars
            bars={latency.bars}
            format={(value) => formatLatency(value)}
            valueLabel="latency"
          />
        )}
        {latency.failed.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t pt-3">
            {latency.failed.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                <ModelName
                  model={byId.get(entry.id)!.model}
                  seriesIndex={entry.seriesIndex}
                  showProvider={false}
                />
                <span className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                  <ResponseStatusLabel status="FAILED" errorCode={entry.errorCode} />
                  {formatLatency(entry.latencyMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard
        title="Token usage"
        description="Input and output tokens as reported by each provider."
      >
        {tokens.bars.length > 0 ? (
          <TokenBars bars={tokens.bars} />
        ) : (
          <p className="text-sm text-muted-foreground">No provider reported token usage.</p>
        )}
        {tokens.missing.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            N/A — not reported by the provider:{" "}
            {tokens.missing.map((entry) => entry.label).join(", ")}
          </p>
        )}
      </ChartCard>
    </div>
  );
}
