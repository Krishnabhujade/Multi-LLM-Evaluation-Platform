export interface WeightedScore {
  key: string;
  /** 0–10 from the judge. */
  score: number;
  /** Percentage points (any positive scale; normalized here). */
  weight: number;
}

/**
 * Weighted overall score on the 0–10 scale: Σ(wᵢ·sᵢ) / Σ(wᵢ) over the criteria that were
 * scored. Normalizing by the weights actually present means weights need not sum to 100, and
 * a criterion that could not be scored does not silently count as zero.
 *
 * Computed server-side rather than asked of the judge: LLM arithmetic is unreliable, and weights
 * must be changeable without re-judging. Rounded to 2 decimals so ranks match what users see.
 */
export function weightedOverall(scores: WeightedScore[]): number | null {
  const weighted = scores.filter((entry) => entry.weight > 0);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;
  const total = weighted.reduce((sum, entry) => sum + entry.weight * entry.score, 0);
  return Math.round((total / totalWeight) * 100) / 100;
}

/** Normalizes weights to fractions summing to 1 (for display as percentages). */
export function normalizeWeights<T extends { weight: number }>(
  items: T[],
): Array<T & { share: number }> {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  return items.map((item) => ({
    ...item,
    share: total > 0 ? Math.max(0, item.weight) / total : 0,
  }));
}
