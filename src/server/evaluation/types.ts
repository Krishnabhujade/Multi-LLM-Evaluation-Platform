import type { EvaluationMode, PairOutcome, RunCriterion } from "@/lib/api-types";
import type { TaskCategory } from "@/lib/categories";
import type { LLMErrorCode } from "@/lib/llm-errors";
import type { ModelPricing } from "@/server/llm/catalog";
import type { TokenUsage } from "@/server/llm/types";

/** Everything the orchestrator needs to know about a run's request. */
export interface RunConfig {
  id: string;
  prompt: string;
  systemPrompt: string | null;
  temperature: number;
  maxTokens: number;
  mode: EvaluationMode;
  blind: boolean;
  category: TaskCategory;
  criteria: RunCriterion[];
  judgeModelRef: string;
  shuffleSeed: string;
  requestId: string | null;
}

/** One selected model within a run (a ModelResponse row created with the run). */
export interface CandidateSlot {
  responseId: string;
  modelDbId: string;
  modelRef: string;
  /** The provider's own model id. */
  modelId: string;
  displayName: string;
  providerName: string;
  isDemo: boolean;
  pricing?: ModelPricing;
  /** Anonymous label shown to the judge. */
  anonLabel: string;
  /** Position in the seeded-shuffled judging order. */
  judgeOrder: number;
}

export interface ExecutionContext {
  run: RunConfig;
  slots: CandidateSlot[];
}

export interface CandidateResult {
  status: "SUCCESS" | "FAILED";
  content?: string;
  finishReason?: string;
  resolvedModel?: string;
  errorCode?: LLMErrorCode;
  errorMessage?: string;
  attempts: number;
  startedAt: Date;
  completedAt: Date;
  latencyMs: number;
  usage?: TokenUsage;
  /** null = pricing unknown. */
  estimatedCostUsd: number | null;
}

export interface CandidateOutcome extends CandidateResult {
  slot: CandidateSlot;
}

/** A judge verdict for one response, as persisted. Scores carry the criterion's name and weight. */
export type JudgementRecord =
  | {
      status: "SCORED";
      judgedBy: string;
      summary: string;
      strengths: string[];
      weaknesses: string[];
      scores: Array<{ key: string; name: string; weight: number; score: number; reason: string }>;
    }
  | { status: "FAILED"; error: string };

/** Pairwise verdict for one criterion or one pair: response A wins, B wins, or a tie. */
export type { PairOutcome };

/** One head-to-head comparison in pairwise mode, as persisted (A/B are canonical, not positional). */
export interface PairwiseRecord {
  responseAId: string;
  responseBId: string;
  winner: PairOutcome;
  criteria: Record<string, PairOutcome>;
  /** Both presentation orders agreed on every criterion. */
  consistent: boolean;
  /** Presentation orders that produced a valid verdict (1 or 2). */
  orders: number;
  summary: string;
  judgedBy: string | null;
}

export interface LlmCallRecord {
  runId: string;
  responseId?: string;
  modelDbId: string;
  kind: "CANDIDATE" | "JUDGE";
  attempt: number;
  status: "SUCCESS" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
  startedAt: Date;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  requestId?: string | null;
}
