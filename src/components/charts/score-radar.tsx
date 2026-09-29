"use client";

import { useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { seriesColor } from "@/components/shared/model-name";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { RunDetail } from "@/lib/api-types";
import { buildRadarData, scoredSeries } from "@/lib/chart-data";
import { cn } from "@/lib/utils";

/**
 * Criterion scores per model. Overlapping polygons get hard to read past a few models, so the
 * legend doubles as an emphasis control: hovering or focusing a model dims the others.
 */
export function ScoreRadar({ run }: { run: RunDetail }) {
  const series = scoredSeries(run);
  const data = buildRadarData(run);
  const [active, setActive] = useState<string | null>(null);

  if (series.length === 0 || run.criteria.length < 3) return null;

  const config = Object.fromEntries(
    series.map((entry) => [
      entry.id,
      { label: entry.label, color: seriesColor(entry.seriesIndex) },
    ]),
  ) satisfies ChartConfig;
  const emphasis = (id: string) => active === null || active === id;

  return (
    <ChartCard
      title="Criterion scores"
      description="Each axis is one criterion, scored 0–10 by the judge."
    >
      <ChartContainer config={config} className="mx-auto aspect-square max-h-[360px] w-full">
        <RadarChart data={data} outerRadius="72%">
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="criterion"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 10]} tickCount={6} axisLine={false} tick={false} />
          {series.map((entry) => (
            <Radar
              key={entry.id}
              dataKey={entry.id}
              name={entry.label}
              stroke={`var(--color-${entry.id})`}
              strokeWidth={2}
              strokeOpacity={emphasis(entry.id) ? 1 : 0.15}
              fill={`var(--color-${entry.id})`}
              fillOpacity={active === entry.id ? 0.2 : emphasis(entry.id) ? 0.1 : 0.02}
              dot={{
                r: 4,
                fill: `var(--color-${entry.id})`,
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
            />
          ))}
        </RadarChart>
      </ChartContainer>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label="Models">
        {series.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(entry.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(entry.id)}
              onBlur={() => setActive(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-opacity",
                emphasis(entry.id) ? "text-foreground" : "text-muted-foreground opacity-60",
              )}
            >
              <span
                aria-hidden
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: seriesColor(entry.seriesIndex) }}
              />
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
