import type {
  CandidateResult,
  ExecutionContext,
  JudgementRecord,
  LlmCallRecord,
} from "@/server/evaluation/types";
import type { ModelInfo } from "@/server/llm/types";

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
  saveJudgement(responseId: string, judgement: JudgementRecord): Promise<void>;
  recordLlmCalls(calls: LlmCallRecord[]): Promise<void>;
  /** Ensures a model row exists (e.g. a fallback judge) and returns its id. */
  ensureModel(model: ModelInfo): Promise<string>;
  completeRun(
    runId: string,
    outcome: { winnerResponseId: string | null; error?: string },
  ): Promise<void>;
  /** Marks the run FAILED and any still-pending responses as aborted. */
  failRun(runId: string, message: string): Promise<void>;
}
