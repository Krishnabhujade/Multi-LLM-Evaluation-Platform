"use client";

import { AlertTriangle, FlaskConical, Scale } from "lucide-react";
import { RunCharts } from "@/components/charts/run-charts";
import { TraceWaterfall } from "@/components/charts/trace-waterfall";
import { ComparisonTable } from "@/components/run/comparison-table";
import { ResponseCard } from "@/components/run/response-card";
import { RunDetails } from "@/components/run/run-details";
import { RunHeader } from "@/components/run/run-header";
import { RunProgress } from "@/components/run/run-progress";
import { useRunStream } from "@/components/run/use-run-stream";
import { WinnerCard } from "@/components/run/winner-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResponseDetail, RunDetail } from "@/lib/api-types";
import { tiedRunnerUp } from "@/lib/scoring";

/** Ranked responses first, then unscored successes, then failures. */
function displayOrder(responses: ResponseDetail[]): ResponseDetail[] {
  const bucket = (response: ResponseDetail) =>
    response.rank !== null
      ? 0
      : response.status === "SUCCESS"
        ? 1
        : response.status === "PENDING"
          ? 2
          : 3;
  return [...responses].sort((a, b) => bucket(a) - bucket(b) || (a.rank ?? 0) - (b.rank ?? 0));
}

export function RunView({ initialRun }: { initialRun: RunDetail }) {
  const { run, phase, live, judging, notice } = useRunStream(initialRun);

  // Series colors follow the model (selection order), never its rank.
  const seriesIndex = new Map(run.responses.map((response, index) => [response.id, index]));
  const finished = run.status === "COMPLETED" || run.status === "FAILED";
  const winner = run.responses.find((response) => response.id === run.winnerResponseId) ?? null;
  const ordered = displayOrder(run.responses);
  const judgeIsCandidate = run.responses.some(
    (response) => response.model.ref === run.judgeModel.ref,
  );
  const usesDemoData =
    run.judgeModel.isDemo || run.responses.some((response) => response.model.isDemo);

  return (
    <div className="space-y-6">
      <RunHeader run={run} />

      {notice && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Could not start the evaluation</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {usesDemoData && (
        <Alert>
          <FlaskConical aria-hidden />
          <AlertTitle>Demo data</AlertTitle>
          <AlertDescription>
            Demo models and the demo judge produce synthetic responses and heuristic scores for
            development — they are not real model outputs or judgements.
          </AlertDescription>
        </Alert>
      )}
      {judgeIsCandidate && (
        <Alert>
          <Scale aria-hidden />
          <AlertTitle>Possible self-preference bias</AlertTitle>
          <AlertDescription>
            The judge model also competed in this evaluation. LLM judges can favor their own outputs
            — consider a different judge for a fairer comparison.
          </AlertDescription>
        </Alert>
      )}

      {!finished && (
        <>
          <RunProgress
            run={run}
            phase={phase}
            live={live}
            judging={judging}
            seriesIndex={seriesIndex}
          />
          <div className="space-y-4">
            {ordered
              .filter((response) => response.status !== "PENDING")
              .map((response) => (
                <div
                  key={response.id}
                  className="animate-in duration-500 fade-in slide-in-from-bottom-2"
                >
                  <ResponseCard
                    response={response}
                    criteria={run.criteria}
                    seriesIndex={seriesIndex.get(response.id)}
                    isWinner={false}
                  />
                </div>
              ))}
          </div>
        </>
      )}

      {run.status === "FAILED" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Evaluation failed</AlertTitle>
          <AlertDescription>{run.error ?? "The evaluation did not complete."}</AlertDescription>
        </Alert>
      )}

      {finished && (
        <>
          {winner ? (
            <WinnerCard
              winner={winner}
              seriesIndex={seriesIndex.get(winner.id)}
              runnerUpTie={tiedRunnerUp(run.responses)}
            />
          ) : (
            run.status === "COMPLETED" && (
              <Alert>
                <AlertTriangle aria-hidden />
                <AlertTitle>No winner</AlertTitle>
                <AlertDescription>
                  {run.error ?? "No response could be scored."} All responses are still shown below.
                </AlertDescription>
              </Alert>
            )
          )}

          <Tabs defaultValue="comparison">
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
              <TabsTrigger value="charts">Charts</TabsTrigger>
              <TabsTrigger value="responses">All responses</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="comparison" className="pt-4">
              <ComparisonTable
                responses={run.responses}
                criteria={run.criteria}
                winnerResponseId={run.winnerResponseId}
                seriesIndex={seriesIndex}
              />
            </TabsContent>
            <TabsContent value="responses" className="space-y-4 pt-4">
              {ordered.map((response) => (
                <ResponseCard
                  key={response.id}
                  response={response}
                  criteria={run.criteria}
                  seriesIndex={seriesIndex.get(response.id)}
                  isWinner={response.id === run.winnerResponseId}
                />
              ))}
            </TabsContent>
            <TabsContent value="charts" className="pt-4">
              <RunCharts run={run} />
            </TabsContent>
            <TabsContent value="trace" className="pt-4">
              <TraceWaterfall run={run} />
            </TabsContent>
            <TabsContent value="details" className="pt-4">
              <RunDetails run={run} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
