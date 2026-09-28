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

/**
 * Runs the configured evaluation strategy over the successful responses. Each judgement is
 * persisted and announced as soon as it is available; every judge call attempt (including
 * fallback judges) is recorded in the trace.
 */
export async function judgeCandidates(
  context: ExecutionContext,
  candidates: CandidateOutcome[],
  deps: JudgingDeps,
  emit: (event: RunEvent) => void,
): Promise<Map<string, JudgeResult>> {
  const { run } = context;
  const judgeRefs = [...new Set([run.judgeModelRef, ...deps.judge.fallbackRefs])];
  const criteriaByKey = new Map(run.criteria.map((criterion) => [criterion.key, criterion]));
  const modelIds = new Map<string, Promise<string>>();
  const total = candidates.length;
  let completed = 0;

  emit({ type: "judging.started", judgeModelRef: run.judgeModelRef, total });

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

  return strategy.evaluate(
    { run, candidates, judgeRefs },
    {
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
        completed += 1;
        emit({
          type: "judging.progress",
          responseId,
          status: result.ok ? "SCORED" : "FAILED",
          completed,
          total,
        });
      },
    },
  );
}
