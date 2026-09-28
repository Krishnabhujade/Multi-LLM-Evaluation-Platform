"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { LiveModelState, RunPhase } from "@/components/run/use-run-stream";
import { ModelName } from "@/components/shared/model-name";
import { errorLabel } from "@/components/shared/response-status";
import { Card, CardContent } from "@/components/ui/card";
import type { RunDetail } from "@/lib/api-types";
import { formatLatency } from "@/lib/format";
import { cn } from "@/lib/utils";

type StepState = "done" | "active" | "upcoming";

const ORDER: RunPhase[] = ["queued", "calling", "judging", "finalizing", "completed"];

function stepState(phase: RunPhase, step: RunPhase): StepState {
  const current = ORDER.indexOf(phase === "failed" ? "completed" : phase);
  const index = ORDER.indexOf(step);
  if (current > index) return "done";
  return current === index ? "active" : "upcoming";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="size-4 text-status-good" aria-hidden />;
  if (state === "active")
    return <Loader2 className="size-4 animate-spin text-viz-accent" aria-hidden />;
  return <Circle className="size-4 text-muted-foreground/40" aria-hidden />;
}

function Step({
  state,
  title,
  children,
}: {
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className="relative z-10 mt-0.5 bg-card">
        <StepIcon state={state} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

/** Live pipeline view: preparing → calling models (per model) → judging → final comparison. */
export function RunProgress({
  run,
  phase,
  live,
  judging,
  seriesIndex,
}: {
  run: RunDetail;
  phase: RunPhase;
  live: Record<string, LiveModelState>;
  judging: { completed: number; total: number } | null;
  seriesIndex: Map<string, number>;
}) {
  const finishedModels = run.responses.filter((response) => {
    const status = live[response.id]?.status;
    return status === "succeeded" || status === "failed";
  }).length;
  const judgedCount =
    judging?.completed ??
    Object.values(live).filter((state) => state.judge === "scored" || state.judge === "failed")
      .length;
  const judgeTotal =
    judging?.total ?? Object.values(live).filter((state) => state.status === "succeeded").length;

  return (
    <Card>
      <CardContent>
        <ol
          aria-live="polite"
          className="relative before:absolute before:top-2 before:bottom-2 before:left-[7.5px] before:w-px before:bg-border"
        >
          <Step state={stepState(phase, "queued")} title="Preparing evaluation" />
          <Step
            state={stepState(phase, "calling")}
            title={`Calling ${run.responses.length} models in parallel · ${finishedModels}/${run.responses.length}`}
          >
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {run.responses.map((response) => {
                const state = live[response.id];
                return (
                  <li
                    key={response.id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    {state?.status === "succeeded" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-status-good" aria-hidden />
                    ) : state?.status === "failed" ? (
                      <AlertTriangle className="size-4 shrink-0 text-status-warning" aria-hidden />
                    ) : state?.status === "calling" ? (
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-hidden />
                    )}
                    <ModelName
                      model={response.model}
                      seriesIndex={seriesIndex.get(response.id)}
                      showProvider={false}
                      className="flex-1"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {state?.status === "failed"
                        ? errorLabel(state.errorCode ?? null)
                        : state?.status === "succeeded"
                          ? formatLatency(state.latencyMs)
                          : ""}
                      {state?.attempts && state.attempts > 1 ? ` · ${state.attempts} tries` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Step>
          <Step
            state={stepState(phase, "judging")}
            title={
              judgeTotal > 0
                ? `Evaluating responses with ${run.judgeModel.displayName} · ${judgedCount}/${judgeTotal}`
                : `Evaluating responses with ${run.judgeModel.displayName}`
            }
          />
          <Step state={stepState(phase, "finalizing")} title="Generating final comparison" />
        </ol>
      </CardContent>
    </Card>
  );
}
