import { TIE_EPSILON } from "@/lib/scoring";
import type { WeightedScore } from "@/server/evaluation/scoring/overall";

export { TIE_EPSILON };

export interface RankInput {
  responseId: string;
  /** null when the response could not be scored. */
  overall: number | null;
  scores: WeightedScore[];
  latencyMs: number | null;
}

export interface RankingEntry {
  responseId: string;
  overallScore: number | null;
  /** 1-based; null for unscored responses. */
  rank: number | null;
}

export interface RankingResult {
  entries: RankingEntry[];
  winnerResponseId: string | null;
  /** The winner is within TIE_EPSILON of the runner-up. */
  isTie: boolean;
}

/**
 * Ranks scored responses deterministically:
 *   1. overall score (desc)
 *   2. score on the highest-weighted criterion (desc) — what the user said matters most
 *   3. latency (asc) — at equal quality, the faster model wins
 *   4. response id — a stable last resort
 * Unscored responses are listed without a rank and can never win.
 */
export function rankResponses(inputs: RankInput[]): RankingResult {
  const scored = inputs.filter((input) => input.overall !== null);
  const primaryKey = highestWeightedKey(scored);
  const primaryScore = (input: RankInput) =>
    input.scores.find((entry) => entry.key === primaryKey)?.score ?? -1;

  const ordered = [...scored].sort(
    (a, b) =>
      b.overall! - a.overall! ||
      primaryScore(b) - primaryScore(a) ||
      (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER) ||
      a.responseId.localeCompare(b.responseId),
  );

  const ranks = new Map(ordered.map((input, index) => [input.responseId, index + 1]));
  const [first, second] = ordered;

  return {
    entries: inputs.map((input) => ({
      responseId: input.responseId,
      overallScore: input.overall,
      rank: ranks.get(input.responseId) ?? null,
    })),
    winnerResponseId: first?.responseId ?? null,
    isTie: Boolean(first && second && first.overall! - second.overall! < TIE_EPSILON),
  };
}

function highestWeightedKey(inputs: RankInput[]): string | undefined {
  let best: WeightedScore | undefined;
  for (const input of inputs) {
    for (const entry of input.scores) {
      if (!best || entry.weight > best.weight) best = entry;
    }
  }
  return best?.key;
}
