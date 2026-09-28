"use client";

import { Gavel } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { ModelName } from "@/components/shared/model-name";
import { ResponseStatusLabel, errorLabel } from "@/components/shared/response-status";
import { ScoreMeter } from "@/components/shared/score-meter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResponseDetail, RunCriterion } from "@/lib/api-types";
import {
  formatCost,
  formatCriterionScore,
  formatDateTime,
  formatLatency,
  formatPercent,
  formatScore,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function Meta({ response }: { response: ResponseDetail }) {
  const items = [
    formatLatency(response.latencyMs),
    response.totalTokens !== null
      ? `${formatTokens(response.inputTokens)} in · ${formatTokens(response.outputTokens)} out`
      : undefined,
    response.status === "SUCCESS" ? formatCost(response.estimatedCostUsd) : undefined,
    response.attempts > 1 ? `${response.attempts} attempts` : undefined,
    formatDateTime(response.completedAt),
  ].filter(Boolean);
  return <p className="text-xs text-muted-foreground tabular-nums">{items.join(" · ")}</p>;
}

function Evaluation({
  response,
  criteria,
}: {
  response: ResponseDetail;
  criteria: RunCriterion[];
}) {
  if (response.judgeStatus === "FAILED") {
    return (
      <p className="text-sm text-muted-foreground">
        This response could not be scored: {response.judgeError ?? "the judge failed."}
      </p>
    );
  }
  if (response.scores.length === 0) {
    return <p className="text-sm text-muted-foreground">Waiting for the judge…</p>;
  }

  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  return (
    <div className="space-y-5">
      <ul className="space-y-4">
        {response.scores.map((score) => (
          <li key={score.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {score.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  weight {formatPercent(totalWeight > 0 ? score.weight / totalWeight : 0)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">
                {formatCriterionScore(score.score)}/10
              </span>
            </div>
            <ScoreMeter score={score.score} label={`${score.name} score`} />
            <p className="text-sm text-muted-foreground">{score.reason}</p>
          </li>
        ))}
      </ul>
      {response.judgeSummary && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-medium">Judge summary</p>
          <p className="text-sm text-muted-foreground">{response.judgeSummary}</p>
          {(response.strengths.length > 0 || response.weaknesses.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {response.strengths.map((item) => (
                <Badge key={`s-${item}`} variant="secondary" className="font-normal">
                  + {item}
                </Badge>
              ))}
              {response.weaknesses.map((item) => (
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
      {response.judgedBy && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gavel className="size-3.5" aria-hidden /> Scored by{" "}
          <span className="font-mono">{response.judgedBy}</span> as “Response {response.anonLabel}”
        </p>
      )}
    </div>
  );
}

export function ResponseCard({
  response,
  criteria,
  seriesIndex,
  isWinner,
}: {
  response: ResponseDetail;
  criteria: RunCriterion[];
  seriesIndex?: number;
  isWinner: boolean;
}) {
  return (
    <Card
      id={`response-${response.id}`}
      className={cn("scroll-mt-20", isWinner && "ring-2 ring-viz-accent/40")}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {response.rank !== null && (
              <Badge variant={isWinner ? "default" : "secondary"} className="tabular-nums">
                #{response.rank}
              </Badge>
            )}
            <ModelName model={response.model} seriesIndex={seriesIndex} />
          </div>
          <Meta response={response} />
        </div>
        <div className="flex items-center gap-4">
          <ResponseStatusLabel status={response.status} errorCode={response.errorCode} />
          {response.overallScore !== null && (
            <p className="text-2xl font-semibold tracking-tight">
              {formatScore(response.overallScore)}
              <span className="text-sm font-normal text-muted-foreground">/10</span>
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {response.status === "FAILED" ? (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">{errorLabel(response.errorCode)}</p>
            <p className="mt-1 text-muted-foreground">{response.errorMessage}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              The other models were evaluated normally — one failure never stops a run.
            </p>
          </div>
        ) : response.status === "PENDING" ? (
          <p className="text-sm text-muted-foreground">Waiting for this model to respond…</p>
        ) : (
          <Tabs defaultValue="response">
            <TabsList>
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
            </TabsList>
            <TabsContent value="response" className="pt-3">
              <Markdown>{response.content ?? ""}</Markdown>
            </TabsContent>
            <TabsContent value="evaluation" className="pt-3">
              <Evaluation response={response} criteria={criteria} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
