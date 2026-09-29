"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { seriesColor } from "@/components/shared/model-name";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ValueBar } from "@/lib/chart-data";
import { formatLatency, formatScore } from "@/lib/format";

const BAR_SIZE = 20; // ≤ 24px: marks never fill their band
const ROW_HEIGHT = 36;

/**
 * Axis and label conventions per unit. Chosen by name (not passed as functions) so server
 * components can render these charts — functions cannot cross the RSC boundary.
 */
const UNITS = {
  score: {
    domain: [0, 10] as [number, number],
    ticks: [0, 2, 4, 6, 8, 10],
    format: (value: number) => formatScore(value),
    tickFormat: (value: number) => String(value),
    valueLabel: "/ 10",
  },
  latency: {
    domain: [0, "auto"] as [number, "auto"],
    ticks: undefined,
    format: (value: number) => formatLatency(value),
    tickFormat: (value: number) => formatLatency(value),
    valueLabel: "latency",
  },
} as const;

/**
 * Horizontal bars, one per model, in each model's series color. Model names on the axis carry
 * identity (never color alone); the value sits at the bar's tip in a text token.
 */
export function ValueBars({
  bars,
  unit,
  color,
}: {
  bars: ValueBar[];
  unit: keyof typeof UNITS;
  /** One color for every bar (a single series); by default each bar uses its model's color. */
  color?: string;
}) {
  const { domain, ticks, format, tickFormat, valueLabel } = UNITS[unit];
  const config = { value: { label: valueLabel } } satisfies ChartConfig;
  const height = Math.max(ROW_HEIGHT * bars.length + 32, 96);

  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart
        data={bars}
        layout="vertical"
        margin={{ left: 0, right: 56, top: 0, bottom: 0 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          domain={domain}
          ticks={ticks ? [...ticks] : undefined}
          tickFormatter={tickFormat}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fill: "var(--foreground)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <span className="font-medium text-foreground tabular-nums">
                  {format(Number(value))}{" "}
                  <span className="font-normal text-muted-foreground">{valueLabel}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="value" barSize={BAR_SIZE} radius={[0, 4, 4, 0]} isAnimationActive>
          {bars.map((bar) => (
            <Cell key={bar.id} fill={color ?? seriesColor(bar.seriesIndex)} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value: unknown) => format(Number(value))}
            className="fill-foreground text-xs tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
