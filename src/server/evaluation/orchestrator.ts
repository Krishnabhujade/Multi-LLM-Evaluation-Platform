import type { RunEvent } from "@/lib/run-events";
import { collectCandidates } from "@/server/evaluation/collector";
import { judgeCandidates, type JudgingDeps } from "@/server/evaluation/judging";
import type { RunStore } from "@/server/evaluation/store";
import type { ProviderRegistry } from "@/server/llm/registry";
import type { Logger } from "@/server/observability/logger";

export class RunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`Evaluation ${runId} not found`);
    this.name = "RunNotFoundError";
  }
}

export class RunAlreadyStartedError extends Error {
  constructor(readonly runId: string) {
    super(`Evaluation ${runId} has already been started`);
    this.name = "RunAlreadyStartedError";
  }
}

export interface OrchestratorDeps {
  store: RunStore;
  registry: Pick<ProviderRegistry, "resolve">;
  timeoutMs: number;
  maxRetries: number;
  /** Overall budget for one run; kept below the platform's maximum function duration. */
  runBudgetMs: number;
  logger: Logger;
  judge: JudgingDeps["judge"];
  now?: () => number;
}

/**
 * Claims a PENDING run for execution. Done before any streaming starts so "not found" and
 * "already running" surface as proper HTTP errors, and so a run can never execute twice.
 */
export async function claimRun(store: RunStore, runId: string): Promise<void> {
  if (await store.markRunning(runId)) return;
  const exists = await store.getExecutionContext(runId);
  throw exists ? new RunAlreadyStartedError(runId) : new RunNotFoundError(runId);
}

/**
 * Runs a claimed evaluation end to end: fan out to every model, then (in later stages) judge,
 * score and pick a winner. Progress is reported through `emit`; the transport (SSE, a queue
 * worker, a test) is the caller's concern. Never throws for model or judge failures.
 */
export async function executeRun(
  runId: string,
  deps: OrchestratorDeps,
  emit: (event: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const log = deps.logger.child({ runId });
  const context = await deps.store.getExecutionContext(runId);
  if (!context) throw new RunNotFoundError(runId);

  const deadline = now() + deps.runBudgetMs;
  const startedAt = now();

  try {
    emit({
      type: "run.started",
      runId,
      judgeModelRef: context.run.judgeModelRef,
      candidates: context.slots.map((slot) => ({
        responseId: slot.responseId,
        modelRef: slot.modelRef,
        displayName: slot.displayName,
        providerName: slot.providerName,
        isDemo: slot.isDemo,
      })),
    });

    const outcomes = await collectCandidates(
      context,
      {
        registry: deps.registry,
        store: deps.store,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        deadline,
        signal,
        logger: log,
      },
      emit,
    );

    const succeeded = outcomes.filter((outcome) => outcome.status === "SUCCESS");
    log.info("Candidate collection finished", {
      succeeded: succeeded.length,
      failed: outcomes.length - succeeded.length,
      elapsedMs: now() - startedAt,
    });

    if (succeeded.length === 0) {
      const message = "Every model failed to respond — see each model's error for details.";
      await deps.store.failRun(runId, message);
      emit({ type: "run.failed", runId, message });
      return;
    }

    const judgements = await judgeCandidates(
      context,
      succeeded,
      {
        store: deps.store,
        registry: deps.registry,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        deadline,
        signal,
        logger: log,
        judge: deps.judge,
      },
      emit,
    );
    const scored = [...judgements.values()].filter((result) => result.ok).length;
    log.info("Judging finished", { scored, unscored: judgements.size - scored });

    await deps.store.completeRun(runId, {
      winnerResponseId: null,
      ...(scored === 0 && { error: "The judge could not score any response." }),
    });
    emit({ type: "run.completed", runId, winnerResponseId: null });
  } catch (error) {
    log.error("Evaluation run crashed", { error });
    const message = "The evaluation failed unexpectedly. Please try again.";
    await deps.store.failRun(runId, message).catch(() => undefined);
    emit({ type: "run.failed", runId, message });
  }
}
