import type { EvaluationMode } from "@/lib/api-types";
import type { JudgeResult } from "@/server/evaluation/judge/judge-client";
import type { CandidateOutcome, RunConfig } from "@/server/evaluation/types";

export interface StrategyInput {
  run: RunConfig;
  /** Successful candidates only. */
  candidates: CandidateOutcome[];
  /** Primary judge first, then fallbacks. */
  judgeRefs: string[];
}

export interface StrategyCallbacks {
  /** Called as soon as one response is judged (persist + progress event). */
  onJudged(responseId: string, result: JudgeResult): Promise<void>;
}

/**
 * An evaluation strategy turns successful candidate responses into per-criterion scores (0–10).
 * Every strategy produces the same output shape, so scoring, ranking, storage and UI are shared;
 * adding a strategy means implementing this interface and registering it in `index.ts`.
 */
export interface EvaluationStrategy {
  readonly mode: EvaluationMode;
  evaluate(input: StrategyInput, callbacks: StrategyCallbacks): Promise<Map<string, JudgeResult>>;
}
