import { Info, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChartCard } from "@/components/charts/chart-card";
import { ValueBars } from "@/components/charts/value-bars";
import { LeaderboardFilters } from "@/components/leaderboard/leaderboard-filters";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { DatabaseSetupNotice } from "@/components/shared/setup-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { LeaderboardEntry } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/categories";
import {
  LEADERBOARD_RANGES,
  MIN_LEADERBOARD_SAMPLE,
  parseLeaderboardQuery,
} from "@/lib/leaderboard";
import { getLeaderboard } from "@/server/db/leaderboard";
import { DatabaseNotConfiguredError, getPrisma } from "@/server/db/prisma";

export const metadata: Metadata = { title: "Leaderboard" };

/** Bar labels must tell apart models that share a display name (e.g. two router policies). */
function chartLabel(entry: LeaderboardEntry, entries: LeaderboardEntry[]) {
  const duplicate =
    entries.filter((other) => other.model.displayName === entry.model.displayName).length > 1;
  return duplicate
    ? `${entry.model.displayName} · ${entry.model.modelId.split(":").at(-1)}`
    : entry.model.displayName;
}

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const query = parseLeaderboardQuery(await searchParams);
  let data;
  try {
    data = await getLeaderboard(getPrisma(), query);
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) return <DatabaseSetupNotice />;
    throw error;
  }

  const metricName =
    query.sort === "overall"
      ? "overall score"
      : (data.criterionKeys.find((criterion) => criterion.key === query.sort)?.name ?? query.sort);
  const metric = (entry: LeaderboardEntry) =>
    query.sort === "overall" ? entry.avgOverall : (entry.criteria[query.sort] ?? null);
  const bars = data.entries
    .filter((entry) => metric(entry) !== null)
    .slice(0, 10)
    .map((entry, index) => ({
      id: entry.model.ref,
      label: chartLabel(entry, data.entries),
      seriesIndex: index,
      value: metric(entry)!,
    }));
  const scope = [
    LEADERBOARD_RANGES[query.range].label.toLowerCase(),
    query.category ? CATEGORY_LABELS[query.category] : "all categories",
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Model leaderboard</h1>
        <p className="text-muted-foreground">
          Average judge scores per model across {data.totalRuns} completed evaluation
          {data.totalRuns === 1 ? "" : "s"} ({scope}).
        </p>
      </div>

      <Alert>
        <Info aria-hidden />
        <AlertTitle>Based on evaluations performed on this platform</AlertTitle>
        <AlertDescription>
          These rankings reflect the prompts people ran here, scored by an LLM judge against this
          platform&apos;s rubric. They are not a universal measure of model quality. Models with
          fewer than {MIN_LEADERBOARD_SAMPLE} scored responses are marked “Low sample”.
        </AlertDescription>
      </Alert>

      <LeaderboardFilters query={query} criterionKeys={data.criterionKeys} />

      {data.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Trophy className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No evaluations in this scope yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Widen the date range or category, or run an evaluation to start the leaderboard.
          </p>
          <Button asChild>
            <Link href="/">New evaluation</Link>
          </Button>
        </div>
      ) : (
        <>
          {bars.length > 0 && (
            <ChartCard
              title={`Average ${metricName}`}
              description="Top models in scope, out of 10."
            >
              <ValueBars bars={bars} unit="score" color="var(--viz-accent)" />
            </ChartCard>
          )}
          <LeaderboardTable
            entries={data.entries}
            criterionKeys={data.criterionKeys}
            sort={query.sort}
          />
        </>
      )}
    </div>
  );
}
