import type { EvaluationMode } from "@/lib/api-types";
import type { JudgeClientDeps } from "@/server/evaluation/judge/judge-client";
import { StandardStrategy } from "@/server/evaluation/strategies/standard";
import type { EvaluationStrategy } from "@/server/evaluation/strategies/types";

export type StrategyDeps = JudgeClientDeps & { concurrency: number };

/** Strategy registry: one entry per evaluation mode. */
export function createStrategy(mode: EvaluationMode, deps: StrategyDeps): EvaluationStrategy {
  switch (mode) {
    case "STANDARD":
      return new StandardStrategy(deps);
    case "PAIRWISE":
      throw new Error("Pairwise evaluation is not available yet");
  }
}
