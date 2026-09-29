"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { LegendKey } from "@/components/charts/chart-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TokenBar } from "@/lib/chart-data";
import { formatTokens } from "@/lib/format";

const config = {
  input: { label: "Input tokens", color: "var(--viz-ordinal-1)" },
  output: { label: "Output tokens", color: "var(--viz-ordinal-2)" },
} satisfies ChartConfig;

/**
 * Input vs output tokens per model as a stacked bar in two ordered shades of one hue — the
 * segments are "parts of one total", not different models, so they don't reuse model colors.
 * A 2px surface-colored stroke separates the segments.
 */
export function TokenBars({ bars }: { bars: TokenBar[] }) {
  const height = Math.max(36 * bars.length + 32, 96);
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <LegendKey color="var(--viz-ordinal-1)" label="Input" />
        <LegendKey color="var(--viz-ordinal-2)" label="Output" />
      </div>
      <ChartContainer config={config} className="w-full" style={{ height }}>
        <BarChart
          data={bars}
          layout="vertical"
          margin={{ left: 0, right: 64, top: 0, bottom: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatTokens(value)}
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
            content={<ChartTooltipContent indicator="line" />}
          />
          <Bar
            dataKey="input"
            stackId="tokens"
            barSize={20}
            fill="var(--color-input)"
            stroke="var(--card)"
            strokeWidth={2}
          />
          <Bar
            dataKey="output"
            stackId="tokens"
            barSize={20}
            fill="var(--color-output)"
            stroke="var(--card)"
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
          >
            <LabelList
              dataKey="total"
              position="right"
              formatter={(value: unknown) => formatTokens(Number(value))}
              className="fill-foreground text-xs tabular-nums"
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
