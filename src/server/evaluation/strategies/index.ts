import type { EvaluationMode } from "@/lib/api-types";
import { PairwiseStrategy } from "@/server/evaluation/strategies/pairwise";
import { StandardStrategy, type StrategyDeps } from "@/server/evaluation/strategies/standard";
import type { EvaluationStrategy } from "@/server/evaluation/strategies/types";

export type { StrategyDeps };

/** Strategy registry: one entry per evaluation mode. */
export function createStrategy(mode: EvaluationMode, deps: StrategyDeps): EvaluationStrategy {
  switch (mode) {
    case "STANDARD":
      return new StandardStrategy(deps);
    case "PAIRWISE":
      return new PairwiseStrategy(deps);
  }
}
