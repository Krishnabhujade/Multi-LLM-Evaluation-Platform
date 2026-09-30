"use client";

import { AlertTriangle, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { ModelName, seriesColor } from "@/components/shared/model-name";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ResponseDetail, RunDetail } from "@/lib/api-types";
import { buildWinMatrix, type HeadToHead, type WinMatrixCell } from "@/lib/chart-data";
import { cn } from "@/lib/utils";

/** Diverging tints (blue win ↔ red loss, gray tie); every cell also carries a text label. */
const TINT: Record<HeadToHead, string> = {
  WIN: "bg-viz-win",
  TIE: "bg-viz-tie",
  LOSS: "bg-viz-loss",
};
const LABEL: Record<HeadToHead, string> = { WIN: "Win", TIE: "Tie", LOSS: "Loss" };

function Swatch({ outcome }: { outcome: HeadToHead }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-3 rounded-sm border", TINT[outcome])} />
      {LABEL[outcome]}
    </span>
  );
}

/** Replaces the judge's anonymous "Response X" labels with model names (results are unblinded). */
function nameResolver(responses: ResponseDetail[]) {
  const byLabel = new Map(
    responses.map((response) => [response.anonLabel, response.model.displayName]),
  );
  return (text: string) =>
    text.replace(/\bResponse ([A-Z])\b/g, (match, label: string) => byLabel.get(label) ?? match);
}

function CellButton({
  cell,
  rowName,
  columnName,
  named,
}: {
  cell: WinMatrixCell;
  rowName: string;
  columnName: string;
  named: (text: string) => string;
}) {
  const { won, tied, lost } = cell.criteria;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${rowName} vs ${columnName}: ${LABEL[cell.outcome]}, criteria ${won} won, ${tied} tied, ${lost} lost${cell.consistent ? "" : ", presentation orders disagreed"}`}
          className={cn(
            "flex h-full min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            TINT[cell.outcome],
          )}
        >
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            {LABEL[cell.outcome]}
            {!cell.consistent && (
              <ArrowLeftRight className="size-3 text-muted-foreground" aria-hidden />
            )}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {won}–{tied}–{lost}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-left">
        {/* One block child: the tooltip container lays its children out in a row. */}
        <div className="w-full space-y-1.5">
          <p className="font-medium">
            {rowName} vs {columnName}: {LABEL[cell.outcome]}
          </p>
          <ul className="space-y-0.5">
            {cell.perCriterion.map((entry) => (
              <li key={entry.key} className="flex justify-between gap-3">
                <span>{entry.name}</span>
                <span className="tabular-nums">{LABEL[entry.outcome]}</span>
              </li>
            ))}
          </ul>
          {cell.summary && <p className="opacity-80">{named(cell.summary)}</p>}
          <p className="opacity-80">
            {cell.orders < 2
              ? "Judged in one presentation order only."
              : cell.consistent
                ? "Same verdict in both presentation orders."
                : "Orders disagreed on some criteria — those count as ties."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Pairwise results: a win matrix (row model vs column model) plus the list of comparisons.
 * The matrix shows each outcome from the row's point of view with a text label, the criteria
 * tally (won–tied–lost) and a marker when the two presentation orders disagreed.
 */
export function WinMatrix({ run }: { run: RunDetail }) {
  const matrix = buildWinMatrix(run);
  const named = nameResolver(run.responses);
  const byId = new Map(run.responses.map((response) => [response.id, response]));
  const seriesIndex = new Map(run.responses.map((response, index) => [response.id, index]));

  if (matrix.rows.length === 0) {
    return (
      <ChartCard title="Head-to-head">
        <p className="text-sm text-muted-foreground">
          No head-to-head comparison could be judged in this run.
        </p>
      </ChartCard>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCard
        title="Win matrix"
        description="Each row model against each column model. Cells show the overall result and criteria won–tied–lost; hover or focus a cell for the per-criterion verdicts."
      >
        {/* `relative` keeps the absolutely positioned sr-only labels inside the scroll box. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-sm">
            <caption className="sr-only">
              Head-to-head results, from the row model&apos;s point of view
            </caption>
            <thead>
              <tr>
                <th scope="col" className="p-1 text-left text-xs font-normal text-muted-foreground">
                  Model <span className="sr-only">(row)</span> vs
                </th>
                {matrix.rows.map((column) => (
                  <th key={column.id} scope="col" className="p-1 align-bottom">
                    <span className="flex items-center justify-center gap-1.5 text-xs font-medium">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: seriesColor(column.seriesIndex) }}
                      />
                      <span className="max-w-24 truncate" title={column.label}>
                        {column.label}
                      </span>
                    </span>
                  </th>
                ))}
                <th scope="col" className="p-1 text-xs font-medium text-muted-foreground">
                  W–T–L
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => {
                const record = matrix.records[row.id]!;
                return (
                  <tr key={row.id}>
                    <th scope="row" className="max-w-44 p-1 text-left font-normal">
                      <ModelName
                        model={byId.get(row.id)!.model}
                        seriesIndex={row.seriesIndex}
                        showProvider={false}
                        className="max-w-full"
                      />
                    </th>
                    {matrix.rows.map((column) => {
                      const cell = matrix.cells[row.id]?.[column.id];
                      return (
                        <td key={column.id} className="h-12 p-0">
                          {column.id === row.id ? (
                            <span className="flex h-full min-h-12 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
                              <span aria-hidden>—</span>
                              <span className="sr-only">Same model</span>
                            </span>
                          ) : cell ? (
                            <CellButton
                              cell={cell}
                              rowName={row.label}
                              columnName={column.label}
                              named={named}
                            />
                          ) : (
                            <span className="flex h-full min-h-12 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                              Not judged
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1 text-center font-medium tabular-nums">
                      {record.wins}–{record.ties}–{record.losses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Swatch outcome="WIN" />
          <Swatch outcome="TIE" />
          <Swatch outcome="LOSS" />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftRight className="size-3" aria-hidden />
            Orders disagreed (those criteria count as ties)
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {matrix.consistentPairs} of {matrix.totalPairs} pairs got the same verdict in both
          presentation orders. Criterion scores elsewhere on this page are head-to-head win rates ×
          10 (ties count half).
        </p>
      </ChartCard>

      <ChartCard
        title="Comparisons"
        description="Every pair was judged twice, with the responses shown in both orders."
      >
        <ul className="divide-y">
          {run.pairwise.map((comparison) => {
            const a = byId.get(comparison.responseAId);
            const b = byId.get(comparison.responseBId);
            if (!a || !b) return null;
            const winner = comparison.winner === "A" ? a : comparison.winner === "B" ? b : null;
            return (
              <li
                key={`${comparison.responseAId}:${comparison.responseBId}`}
                className="space-y-1.5 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <ModelName
                    model={a.model}
                    seriesIndex={seriesIndex.get(a.id)}
                    showProvider={false}
                  />
                  <span className="text-muted-foreground">vs</span>
                  <ModelName
                    model={b.model}
                    seriesIndex={seriesIndex.get(b.id)}
                    showProvider={false}
                  />
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">
                    {winner ? `${winner.model.displayName} wins` : "Tie"}
                  </span>
                </div>
                {comparison.summary && (
                  <p className="text-sm text-muted-foreground">{named(comparison.summary)}</p>
                )}
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {comparison.consistent ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-status-good" aria-hidden />
                      Same verdict in both orders
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-3.5 text-status-warning" aria-hidden />
                      {comparison.orders < 2
                        ? "Judged in one order only (the other call failed)"
                        : "Orders disagreed on some criteria — counted as ties"}
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </ChartCard>
    </div>
  );
}
