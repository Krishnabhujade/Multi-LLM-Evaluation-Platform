import type { ModelPricing } from "@/server/llm/catalog";
import type { TokenUsage } from "@/server/llm/types";

/**
 * Estimated USD cost of one call from token usage and list pricing. Returns null — shown as
 * "N/A" — when either is unknown; we never guess a price.
 */
export function estimateCostUsd(usage?: TokenUsage, pricing?: ModelPricing): number | null {
  if (!pricing || usage?.inputTokens === undefined || usage.outputTokens === undefined) return null;
  return (
    (usage.inputTokens * pricing.inputPerMTok + usage.outputTokens * pricing.outputPerMTok) /
    1_000_000
  );
}
