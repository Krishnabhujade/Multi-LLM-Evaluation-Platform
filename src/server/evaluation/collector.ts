import type { RunEvent } from "@/lib/run-events";
import { estimateCostUsd } from "@/server/evaluation/scoring/cost";
import type { RunStore } from "@/server/evaluation/store";
import type {
  CandidateOutcome,
  CandidateSlot,
  ExecutionContext,
  LlmCallRecord,
  RunConfig,
} from "@/server/evaluation/types";
import { invokeModel } from "@/server/llm/invoke";
import { ModelUnavailableError, type ProviderRegistry } from "@/server/llm/registry";
import type { AttemptRecord } from "@/server/llm/resilience";
import type { ChatMessage, TokenUsage } from "@/server/llm/types";
import type { Logger } from "@/server/observability/logger";

export interface CollectorDeps {
  registry: Pick<ProviderRegistry, "resolve">;
  store: RunStore;
  timeoutMs: number;
  maxRetries: number;
  /** Epoch ms after which no retry starts. */
  deadline: number;
  signal?: AbortSignal;
  logger: Logger;
}

type Emit = (event: RunEvent) => void;

export function candidateMessages(run: Pick<RunConfig, "prompt" | "systemPrompt">): ChatMessage[] {
  return [
    ...(run.systemPrompt ? [{ role: "system" as const, content: run.systemPrompt }] : []),
    { role: "user" as const, content: run.prompt },
  ];
}

/**
 * Sends the same prompt to every selected model concurrently. Each model is isolated: failures
 * (timeouts, rate limits, outages — even unexpected bugs, via `Promise.allSettled`) become a
 * FAILED outcome for that model while the others carry on.
 */
export async function collectCandidates(
  context: ExecutionContext,
  deps: CollectorDeps,
  emit: Emit,
): Promise<CandidateOutcome[]> {
  const settled = await Promise.allSettled(
    context.slots.map((slot) => collectOne(context.run, slot, deps, emit)),
  );

  return Promise.all(
    settled.map(async (result, index) => {
      if (result.status === "fulfilled") return result.value;

      const slot = context.slots[index]!;
      deps.logger.error("Candidate collection crashed", {
        responseId: slot.responseId,
        error: result.reason,
      });
      const now = new Date();
      const outcome: CandidateOutcome = {
        slot,
        status: "FAILED",
        errorCode: "UNKNOWN",
        errorMessage: "Internal error while calling this model",
        attempts: 0,
        startedAt: now,
        completedAt: now,
        latencyMs: 0,
        estimatedCostUsd: null,
      };
      await deps.store.saveCandidateResult(slot.responseId, outcome).catch(() => undefined);
      emit(failedEvent(outcome));
      return outcome;
    }),
  );
}

async function collectOne(
  run: RunConfig,
  slot: CandidateSlot,
  deps: CollectorDeps,
  emit: Emit,
): Promise<CandidateOutcome> {
  emit({ type: "model.started", responseId: slot.responseId });
  const attempts: AttemptRecord[] = [];
  let outcome: CandidateOutcome;

  try {
    const { provider } = await deps.registry.resolve(slot.modelRef);
    const result = await invokeModel(
      provider,
      {
        model: slot.modelId,
        messages: candidateMessages(run),
        temperature: run.temperature,
        maxTokens: run.maxTokens,
      },
      {
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        deadline: deps.deadline,
        signal: deps.signal,
      },
      { onAttempt: (record) => void attempts.push(record) },
    );
    const base = {
      slot,
      attempts: result.attempts,
      startedAt: result.startedAt,
      completedAt: new Date(),
      latencyMs: result.latencyMs,
    };
    outcome = result.ok
      ? {
          ...base,
          status: "SUCCESS",
          content: result.result.content,
          finishReason: result.result.finishReason,
          resolvedModel: result.result.resolvedModel,
          usage: result.result.usage,
          estimatedCostUsd: estimateCostUsd(result.result.usage, slot.pricing),
        }
      : {
          ...base,
          status: "FAILED",
          errorCode: result.error.code,
          errorMessage: result.error.message,
          estimatedCostUsd: null,
        };
  } catch (error) {
    // The provider lost its key or the model left the catalog after the run was created.
    if (!(error instanceof ModelUnavailableError)) throw error;
    const now = new Date();
    outcome = {
      slot,
      status: "FAILED",
      errorCode: error.reason === "NOT_CONFIGURED" ? "AUTH" : "MODEL_NOT_FOUND",
      errorMessage: error.message,
      attempts: 0,
      startedAt: now,
      completedAt: now,
      latencyMs: 0,
      estimatedCostUsd: null,
    };
  }

  // Persist before announcing, so a client that re-fetches on the event sees the data.
  await deps.store.saveCandidateResult(slot.responseId, outcome);
  await deps.store
    .recordLlmCalls(
      attempts.map((attempt, index) =>
        toCallRecord(
          run,
          slot,
          attempt,
          index === attempts.length - 1 && outcome.status === "SUCCESS" ? outcome.usage : undefined,
        ),
      ),
    )
    .catch((error: unknown) => deps.logger.warn("Failed to record LLM call trace", { error }));

  emit(
    outcome.status === "SUCCESS"
      ? {
          type: "model.completed",
          responseId: slot.responseId,
          latencyMs: outcome.latencyMs,
          attempts: outcome.attempts,
          outputTokens: outcome.usage?.outputTokens,
        }
      : failedEvent(outcome),
  );
  return outcome;
}

function toCallRecord(
  run: RunConfig,
  slot: CandidateSlot,
  attempt: AttemptRecord,
  usage: TokenUsage | undefined,
): LlmCallRecord {
  return {
    runId: run.id,
    responseId: slot.responseId,
    modelDbId: slot.modelDbId,
    kind: "CANDIDATE",
    attempt: attempt.attempt,
    status: attempt.error ? "FAILED" : "SUCCESS",
    errorCode: attempt.error?.code,
    errorMessage: attempt.error?.message,
    startedAt: attempt.startedAt,
    latencyMs: attempt.latencyMs,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    requestId: run.requestId,
  };
}

function failedEvent(outcome: CandidateOutcome): RunEvent {
  return {
    type: "model.failed",
    responseId: outcome.slot.responseId,
    latencyMs: outcome.latencyMs,
    attempts: outcome.attempts,
    errorCode: outcome.errorCode ?? "UNKNOWN",
    message: outcome.errorMessage ?? "Unknown error",
  };
}
