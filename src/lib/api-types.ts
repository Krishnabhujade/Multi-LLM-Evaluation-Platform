import type { TaskCategory } from "@/lib/categories";
import type { Capability } from "@/lib/capabilities";

/** Response DTOs of the public API, shared with client components. Dates are ISO strings. */

export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type EvaluationMode = "STANDARD" | "PAIRWISE";
export type ResponseStatus = "PENDING" | "SUCCESS" | "FAILED";
export type JudgeStatus = "PENDING" | "SCORED" | "FAILED" | "SKIPPED";

export interface RunCriterion {
  key: string;
  name: string;
  description: string;
  rubric?: string;
  /** Percentage points (normalized at scoring time). */
  weight: number;
}

export interface CriterionScoreDetail {
  key: string;
  name: string;
  weight: number;
  score: number;
  reason: string;
}

export interface ModelSummary {
  ref: string;
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  isDemo: boolean;
}

export interface ResponseDetail {
  id: string;
  model: ModelSummary;
  status: ResponseStatus;
  /** Anonymous label the judge saw ("A", "B", ...). */
  anonLabel: string;
  content: string | null;
  finishReason: string | null;
  resolvedModel: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** null = pricing unknown ("N/A"). */
  estimatedCostUsd: number | null;
  cached: boolean;
  judgeStatus: JudgeStatus;
  judgedBy: string | null;
  judgeSummary: string | null;
  strengths: string[];
  weaknesses: string[];
  judgeError: string | null;
  overallScore: number | null;
  rank: number | null;
  scores: CriterionScoreDetail[];
}

export interface LlmCallDetail {
  id: string;
  responseId: string | null;
  kind: "CANDIDATE" | "JUDGE";
  modelRef: string;
  attempt: number;
  status: "SUCCESS" | "FAILED";
  errorCode: string | null;
  startedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface RunDetail {
  id: string;
  status: RunStatus;
  mode: EvaluationMode;
  blind: boolean;
  category: TaskCategory;
  prompt: string;
  systemPrompt: string | null;
  temperature: number;
  maxTokens: number;
  autoSelected: boolean;
  criteria: RunCriterion[];
  judgeModel: ModelSummary;
  winnerResponseId: string | null;
  error: string | null;
  requestId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responses: ResponseDetail[];
  calls: LlmCallDetail[];
}

/** A history row: enough to scan past evaluations without loading every answer. */
export interface RunSummary {
  id: string;
  status: RunStatus;
  mode: EvaluationMode;
  category: TaskCategory;
  /** First ~200 characters of the prompt. */
  prompt: string;
  createdAt: string;
  durationMs: number | null;
  autoSelected: boolean;
  models: Array<
    Pick<ModelSummary, "displayName" | "providerName" | "isDemo"> & { failed: boolean }
  >;
  winner: { displayName: string; overallScore: number | null } | null;
}

export interface RunListPage {
  items: RunSummary[];
  nextCursor: string | null;
}

export interface LeaderboardEntry {
  model: ModelSummary;
  /** Responses the model produced in scope (successful or failed). */
  responses: number;
  /** Responses that received a score. */
  scored: number;
  failures: number;
  wins: number;
  winRate: number | null;
  failureRate: number | null;
  avgOverall: number | null;
  avgLatencyMs: number | null;
  /** Average score per criterion key. */
  criteria: Record<string, number>;
  /** Fewer than MIN_LEADERBOARD_SAMPLE scored responses. */
  lowSample: boolean;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  /** Criterion keys that have data in scope (built-ins first). */
  criterionKeys: Array<{ key: string; name: string }>;
  totalRuns: number;
}

export interface ModelListItem extends ModelSummary {
  capabilities: Capability[];
  contextWindow?: number;
  pricing?: { inputPerMTok: number; outputPerMTok: number };
  available: boolean;
}
