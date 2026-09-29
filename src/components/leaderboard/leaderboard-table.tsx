import { DemoBadge } from "@/components/shared/model-name";
import { ScoreMeter } from "@/components/shared/score-meter";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeaderboardEntry } from "@/lib/api-types";
import { formatCriterionScore, formatLatency, formatPercent, formatScore } from "@/lib/format";
import { cn } from "@/lib/utils";

const head = "h-auto py-2 text-xs whitespace-normal text-muted-foreground";

export function LeaderboardTable({
  entries,
  criterionKeys,
  sort,
}: {
  entries: LeaderboardEntry[];
  criterionKeys: Array<{ key: string; name: string }>;
  sort: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className={cn(head, "w-10")}>#</TableHead>
            <TableHead className={cn(head, "min-w-52")}>Model</TableHead>
            <TableHead className={cn(head, "min-w-36", sort === "overall" && "text-foreground")}>
              Avg overall
            </TableHead>
            {criterionKeys.map((criterion) => (
              <TableHead
                key={criterion.key}
                className={cn(
                  head,
                  "max-w-24 pl-4 text-right",
                  sort === criterion.key && "text-foreground",
                )}
              >
                {criterion.name}
              </TableHead>
            ))}
            <TableHead className={cn(head, "text-right")}>Wins</TableHead>
            <TableHead className={cn(head, "text-right")}>Avg latency</TableHead>
            <TableHead className={cn(head, "text-right")}>Scored</TableHead>
            <TableHead className={cn(head, "text-right")}>Failure rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, index) => (
            <TableRow key={entry.model.ref}>
              <TableCell className="text-muted-foreground tabular-nums">
                {entry.avgOverall === null ? "–" : index + 1}
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{entry.model.displayName}</span>
                    {entry.model.isDemo && <DemoBadge />}
                    {entry.lowSample && (
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground"
                      >
                        Low sample
                      </Badge>
                    )}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {entry.model.providerName} · {entry.model.modelId}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {entry.avgOverall !== null ? (
                  <div className="flex items-center gap-2">
                    <ScoreMeter
                      score={entry.avgOverall}
                      label={`${entry.model.displayName} average`}
                      className="w-16"
                    />
                    <span className={cn("tabular-nums", sort === "overall" && "font-semibold")}>
                      {formatScore(entry.avgOverall)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Never scored</span>
                )}
              </TableCell>
              {criterionKeys.map((criterion) => {
                const value = entry.criteria[criterion.key];
                return (
                  <TableCell
                    key={criterion.key}
                    className={cn(
                      "text-right tabular-nums",
                      sort === criterion.key ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {value === undefined ? "—" : formatCriterionScore(Math.round(value * 10) / 10)}
                  </TableCell>
                );
              })}
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {entry.wins}
                {entry.winRate !== null && entry.responses > 0 && (
                  <span className="text-xs"> ({formatPercent(entry.winRate)})</span>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatLatency(entry.avgLatencyMs)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {entry.scored}/{entry.responses}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {entry.failureRate === null ? "—" : formatPercent(entry.failureRate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
