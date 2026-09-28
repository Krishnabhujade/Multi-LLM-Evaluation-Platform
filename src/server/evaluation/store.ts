import type { CandidateResult, ExecutionContext, LlmCallRecord } from "@/server/evaluation/types";

/**
 * Persistence port used by the orchestrator. The production implementation is Prisma
 * (`src/server/db/evaluation-repository.ts`); tests use an in-memory implementation, which keeps
 * the pipeline testable without a database.
 */
export interface RunStore {
  getExecutionContext(runId: string): Promise<ExecutionContext | null>;
  /** Atomically moves a run from PENDING to RUNNING. Returns false if it was already started. */
  markRunning(runId: string): Promise<boolean>;
  saveCandidateResult(responseId: string, result: CandidateResult): Promise<void>;
  recordLlmCalls(calls: LlmCallRecord[]): Promise<void>;
  completeRun(
    runId: string,
    outcome: { winnerResponseId: string | null; error?: string },
  ): Promise<void>;
  /** Marks the run FAILED and any still-pending responses as aborted. */
  failRun(runId: string, message: string): Promise<void>;
}
