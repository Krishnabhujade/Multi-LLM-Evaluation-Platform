"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { ModelName } from "@/components/shared/model-name";
import { ResponseStatusLabel } from "@/components/shared/response-status";
import { ScoreMeter } from "@/components/shared/score-meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResponseDetail, RunCriterion } from "@/lib/api-types";
import {
  formatCost,
  formatCriterionScore,
  formatLatency,
  formatScore,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "rank" | "overall" | "latency" | "tokens" | "cost" | `criterion:${string}`;
type Direction = "asc" | "desc";

/** Lower is better for latency and cost; higher is better for everything else. */
const LOWER_IS_BETTER = new Set<SortKey>(["latency", "cost", "rank"]);

function valueOf(response: ResponseDetail, key: SortKey): number | null {
  switch (key) {
    case "rank":
      return response.rank;
    case "overall":
      return response.overallScore;
    case "latency":
      return response.status === "SUCCESS" ? response.latencyMs : null;
    case "tokens":
      return response.totalTokens;
    case "cost":
      return response.estimatedCostUsd;
    default:
      return response.scores.find((score) => `criterion:${score.key}` === key)?.score ?? null;
  }
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: Direction };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn("h-auto py-2 text-xs whitespace-normal text-muted-foreground", className)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-left leading-tight hover:text-foreground",
          active && "text-foreground",
        )}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon className="size-3 opacity-60" aria-hidden />
      </button>
    </TableHead>
  );
}

export function ComparisonTable({
  responses,
  criteria,
  winnerResponseId,
  seriesIndex,
}: {
  responses: ResponseDetail[];
  criteria: RunCriterion[];
  winnerResponseId: string | null;
  seriesIndex: Map<string, number>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: "rank",
    direction: "asc",
  });

  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: LOWER_IS_BETTER.has(key) ? "asc" : "desc" },
    );

  const rows = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...responses].sort((a, b) => {
      const left = valueOf(a, sort.key);
      const right = valueOf(b, sort.key);
      if (left === null && right === null)
        return (a.status === "FAILED" ? 1 : 0) - (b.status === "FAILED" ? 1 : 0);
      if (left === null) return 1; // missing values always last
      if (right === null) return -1;
      return (left - right) * factor;
    });
  }, [responses, sort]);

  /** Best value per column, emphasized so the eye lands on it. */
  const best = useMemo(() => {
    const keys: SortKey[] = [
      "overall",
      "latency",
      "cost",
      ...criteria.map((c) => `criterion:${c.key}` as const),
    ];
    return new Map(
      keys.map((key) => {
        const values = responses
          .map((response) => valueOf(response, key))
          .filter((v): v is number => v !== null);
        if (values.length < 2) return [key, null];
        return [key, LOWER_IS_BETTER.has(key) ? Math.min(...values) : Math.max(...values)];
      }),
    );
  }, [criteria, responses]);

  const emphasis = (key: SortKey, value: number | null) =>
    value !== null && best.get(key) === value
      ? "font-semibold text-foreground"
      : "text-muted-foreground";

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <SortHeader label="#" sortKey="rank" sort={sort} onSort={onSort} className="w-10" />
            <TableHead className="min-w-40 text-xs text-muted-foreground">Model</TableHead>
            <SortHeader
              label="Overall"
              sortKey="overall"
              sort={sort}
              onSort={onSort}
              className="min-w-36"
            />
            {criteria.map((criterion) => (
              <SortHeader
                key={criterion.key}
                label={criterion.name}
                sortKey={`criterion:${criterion.key}`}
                sort={sort}
                onSort={onSort}
                className="max-w-24 pl-4 text-right"
              />
            ))}
            <SortHeader
              label="Latency"
              sortKey="latency"
              sort={sort}
              onSort={onSort}
              className="text-right"
            />
            <SortHeader
              label="Tokens"
              sortKey="tokens"
              sort={sort}
              onSort={onSort}
              className="text-right"
            />
            <SortHeader
              label="Cost"
              sortKey="cost"
              sort={sort}
              onSort={onSort}
              className="text-right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((response) => {
            const isWinner = response.id === winnerResponseId;
            return (
              <TableRow
                key={response.id}
                className={cn(isWinner && "bg-viz-accent/5 hover:bg-viz-accent/10")}
              >
                <TableCell className="text-muted-foreground tabular-nums">
                  {response.rank ?? "–"}
                </TableCell>
                <TableCell title={`${response.model.providerName} · ${response.model.modelId}`}>
                  <ModelName
                    model={response.model}
                    seriesIndex={seriesIndex.get(response.id)}
                    showProvider={false}
                  />
                </TableCell>
                <TableCell>
                  {response.overallScore !== null ? (
                    <div className="flex items-center gap-2">
                      <ScoreMeter
                        score={response.overallScore}
                        label={`${response.model.displayName} overall score`}
                        className="w-20"
                      />
                      <span
                        className={cn("tabular-nums", emphasis("overall", response.overallScore))}
                      >
                        {formatScore(response.overallScore)}
                      </span>
                    </div>
                  ) : response.status === "SUCCESS" ? (
                    <span className="text-xs text-muted-foreground">Not scored</span>
                  ) : (
                    // Failed or still running: the status (icon + label) takes the score's place.
                    <ResponseStatusLabel status={response.status} errorCode={response.errorCode} />
                  )}
                </TableCell>
                {criteria.map((criterion) => {
                  const key = `criterion:${criterion.key}` as const;
                  const value = valueOf(response, key);
                  return (
                    <TableCell
                      key={criterion.key}
                      className={cn("text-right tabular-nums", emphasis(key, value))}
                    >
                      {value === null ? "—" : formatCriterionScore(value)}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    emphasis("latency", valueOf(response, "latency")),
                  )}
                >
                  {formatLatency(response.latencyMs)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatTokens(response.totalTokens)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatCost(response.estimatedCostUsd)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
