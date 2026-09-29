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

const BAR_SIZE = 20; // ≤ 24px: marks never fill their band
const ROW_HEIGHT = 36;

/**
 * Horizontal bars, one per model, in each model's series color. Model names on the axis carry
 * identity (never color alone); the value sits at the bar's tip in a text token.
 */
export function ValueBars({
  bars,
  domain,
  ticks,
  format,
  tickFormat = format,
  valueLabel,
}: {
  bars: ValueBar[];
  domain?: [number, number];
  /** Explicit, clean tick values (e.g. 0, 2, 4 … 10). */
  ticks?: number[];
  /** Value format at the bar tips and in tooltips. */
  format: (value: number) => string;
  /** Axis tick format; defaults to `format`. */
  tickFormat?: (value: number) => string;
  valueLabel: string;
}) {
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
          domain={domain ?? [0, "auto"]}
          ticks={ticks}
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
            <Cell key={bar.id} fill={seriesColor(bar.seriesIndex)} />
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
