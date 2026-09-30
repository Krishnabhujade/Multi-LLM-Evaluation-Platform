"use client";

import { Scale, Trophy } from "lucide-react";
import { useState } from "react";
import { CutOffNotice } from "@/components/shared/cut-off-notice";
import { Markdown } from "@/components/shared/markdown";
import { ModelName } from "@/components/shared/model-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ResponseDetail } from "@/lib/api-types";
import { isCutOff } from "@/lib/finish-reason";
import { formatCost, formatLatency, formatScore, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

/**
 * The headline result: the winning model, its overall score as the page's single hero figure,
 * why the judge preferred it, and its full answer.
 */
export function WinnerCard({
  winner,
  seriesIndex,
  runnerUpTie,
}: {
  winner: ResponseDetail;
  seriesIndex?: number;
  runnerUpTie: ResponseDetail | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const longAnswer = (winner.content?.length ?? 0) > 1_200;

  return (
    <Card className="animate-in ring-2 ring-viz-accent/40 duration-500 fade-in slide-in-from-bottom-2">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Trophy className="size-4 text-viz-accent" aria-hidden /> Best response
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              <ModelName model={winner.model} seriesIndex={seriesIndex} showProvider={false} />
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              {winner.model.providerName} · {winner.model.modelId}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-5xl leading-none font-semibold tracking-tight">
              {formatScore(winner.overallScore)}
              <span className="text-lg font-normal text-muted-foreground">/10</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Overall score</p>
          </div>
        </div>

        {runnerUpTie && (
          <Badge variant="outline" className="h-auto w-fit py-1 whitespace-normal">
            <Scale aria-hidden />
            Statistical tie with {runnerUpTie.model.displayName} (
            {formatScore(runnerUpTie.overallScore)}) — decided by the highest-weighted criterion,
            then latency.
          </Badge>
        )}

        <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
          <Stat label="Latency" value={formatLatency(winner.latencyMs)} />
          <Stat label="Output tokens" value={formatTokens(winner.outputTokens)} />
          <Stat label="Estimated cost" value={formatCost(winner.estimatedCostUsd)} />
          <Stat label="Judged by" value={winner.judgedBy?.split(":").slice(1).join(":") ?? "—"} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {winner.judgeSummary && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Why it scored highest</p>
            <p className="text-sm text-muted-foreground">{winner.judgeSummary}</p>
            {(winner.strengths.length > 0 || winner.weaknesses.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {winner.strengths.map((item) => (
                  <Badge key={`s-${item}`} variant="secondary" className="font-normal">
                    + {item}
                  </Badge>
                ))}
                {winner.weaknesses.map((item) => (
                  <Badge
                    key={`w-${item}`}
                    variant="outline"
                    className="font-normal text-muted-foreground"
                  >
                    − {item}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-5">
          <div
            className={cn("relative", !expanded && longAnswer && "max-h-[28rem] overflow-hidden")}
          >
            <Markdown>{winner.content ?? ""}</Markdown>
            {!expanded && longAnswer && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent" />
            )}
          </div>
          {longAnswer && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Collapse answer" : "Show full answer"}
            </Button>
          )}
          {isCutOff(winner.finishReason) && <CutOffNotice />}
        </div>
      </CardContent>
    </Card>
  );
}
