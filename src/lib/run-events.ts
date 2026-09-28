import type { LLMErrorCode } from "@/lib/llm-errors";

/**
 * Progress events streamed (Server-Sent Events) while an evaluation runs. Shared by the server
 * (orchestrator) and the browser (live progress panel).
 */
export interface RunCandidateSummary {
  responseId: string;
  modelRef: string;
  displayName: string;
  providerName: string;
  isDemo: boolean;
}

export type RunEvent =
  | {
      type: "run.started";
      runId: string;
      judgeModelRef: string;
      candidates: RunCandidateSummary[];
    }
  | { type: "model.started"; responseId: string }
  | {
      type: "model.completed";
      responseId: string;
      latencyMs: number;
      attempts: number;
      outputTokens?: number;
    }
  | {
      type: "model.failed";
      responseId: string;
      latencyMs: number;
      attempts: number;
      errorCode: LLMErrorCode;
      message: string;
    }
  | { type: "judging.started"; judgeModelRef: string; total: number }
  | {
      type: "judging.progress";
      responseId: string;
      status: "SCORED" | "FAILED";
      completed: number;
      total: number;
    }
  | { type: "run.completed"; runId: string; winnerResponseId: string | null }
  | { type: "run.failed"; runId: string; message: string };

export type RunEventType = RunEvent["type"];
