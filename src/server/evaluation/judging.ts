import type { RunEvent } from "@/lib/run-events";
import type { JudgeResult } from "@/server/evaluation/judge/judge-client";
import type { RunStore } from "@/server/evaluation/store";
import { createStrategy } from "@/server/evaluation/strategies";
import type {
  CandidateOutcome,
  ExecutionContext,
  JudgementRecord,
} from "@/server/evaluation/types";
import type { ProviderRegistry } from "@/server/llm/registry";
import type { Logger } from "@/server/observability/logger";

export interface JudgingDeps {
  store: RunStore;
  registry: Pick<ProviderRegistry, "resolve">;
  timeoutMs: number;
  maxRetries: number;
  deadline: number;
  signal?: AbortSignal;
  logger: Logger;
  judge: { fallbackRefs: string[]; concurrency: number; maxTokens: number };
}

export interface Judging {
  /** A candidate succeeded: judge it now (pairwise: against every response already in). */
  submit(candidate: CandidateOutcome): void;
  /** A candidate failed: it will never be judged, so the progress plan shrinks. */
  skip(): void;
  /** Every candidate has settled: waits for outstanding judge calls and returns the results. */
  finish(): Promise<Map<string, JudgeResult>>;
}

/**
 * Starts judging for a run while its models are still being called. Judging begins with the
 * first successful response, so a slow model delays only its own judgement rather than the
 * whole phase, and judge calls are spread out (fewer rate limits). Each judgement is persisted
 * and announced as soon as it is available; every judge call attempt (including fallback judges)
 * is recorded in the trace.
 */
export function startJudging(
  context: ExecutionContext,
  deps: JudgingDeps,
  emit: (event: RunEvent) => void,
): Judging {
  const { run } = context;
  const judgeRefs = [...new Set([run.judgeModelRef, ...deps.judge.fallbackRefs])];
  const criteriaByKey = new Map(run.criteria.map((criterion) => [criterion.key, criterion]));
  const modelIds = new Map<string, Promise<string>>();

  const strategy = createStrategy(run.mode, {
    registry: deps.registry,
    timeoutMs: deps.timeoutMs,
    maxRetries: deps.maxRetries,
    maxTokens: deps.judge.maxTokens,
    deadline: deps.deadline,
    signal: deps.signal,
    concurrency: deps.judge.concurrency,
    onCall: async ({ model, attempt, usage, responseId }) => {
      try {
        if (!modelIds.has(model.ref)) modelIds.set(model.ref, deps.store.ensureModel(model));
        const modelDbId = await modelIds.get(model.ref)!;
        await deps.store.recordLlmCalls([
          {
            runId: run.id,
            responseId,
            modelDbId,
            kind: "JUDGE",
            attempt: attempt.attempt,
            status: attempt.error ? "FAILED" : "SUCCESS",
            errorCode: attempt.error?.code,
            errorMessage: attempt.error?.message,
            startedAt: attempt.startedAt,
            latencyMs: attempt.latencyMs,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            requestId: run.requestId,
          },
        ]);
      } catch (error) {
        deps.logger.warn("Failed to record judge call trace", { error });
      }
    },
  });

  // Candidates that have succeeded or are still running; failures shrink the plan.
  let expected = context.slots.length;
  let plan = strategy.plan(expected);
  let started = false;
  let completed = 0;

  const session = strategy.start(
    { run, judgeRefs },
    {
      onComparison: async (result) => {
        if (result.ok) {
          try {
            await deps.store.savePairwiseComparison(run.id, result.comparison);
          } catch (error) {
            deps.logger.warn("Failed to save pairwise comparison", { error });
          }
        } else {
          deps.logger.warn("Pairwise comparison could not be judged", {
            responseAId: result.responseAId,
            responseBId: result.responseBId,
            error: result.error,
          });
        }
        completed += 1;
        emit({
          type: "judging.progress",
          status: result.ok ? "SCORED" : "FAILED",
          completed,
          total: plan.total,
        });
      },
      onJudged: async (responseId, result) => {
        const record: JudgementRecord = result.ok
          ? {
              status: "SCORED",
              judgedBy: result.judgedBy,
              summary: result.judgement.summary,
              strengths: result.judgement.strengths,
              weaknesses: result.judgement.weaknesses,
              scores: result.judgement.scores.map((verdict) => {
                const criterion = criteriaByKey.get(verdict.key)!;
                return { ...verdict, name: criterion.name, weight: criterion.weight };
              }),
            }
          : { status: "FAILED", error: result.error };

        await deps.store.saveJudgement(responseId, record);
        const status = result.ok ? "SCORED" : "FAILED";
        if (plan.unit === "response") {
          completed += 1;
          emit({ type: "judging.progress", responseId, status, completed, total: plan.total });
        } else {
          emit({ type: "response.judged", responseId, status });
        }
      },
    },
  );

  return {
    submit(candidate) {
      if (!started) {
        started = true;
        emit({ type: "judging.started", judgeModelRef: run.judgeModelRef, ...plan });
      }
      session.submit(candidate);
    },
    skip() {
      expected -= 1;
      const next = strategy.plan(expected);
      if (started && (next.total !== plan.total || next.unit !== plan.unit)) {
        emit({ type: "judging.planned", ...next });
      }
      plan = next;
    },
    finish: () => session.finish(),
  };
}
