import type { PairOutcome, PairwiseRecord } from "@/server/evaluation/types";

/**
 * Pairwise aggregation. Each pair is judged twice, once in each presentation order; verdicts are
 * mapped back to the canonical A/B of the pair before they are combined. Per-criterion scores are
 * then win rates (win = 1, tie = ½, loss = 0) × 10, which feed the same weighted scorer and
 * ranking as standard mode, so charts, tables and the leaderboard work unchanged.
 */

const EPSILON = 1e-9;

/** Maps a verdict given with the pair presented in swapped order back to the canonical A/B. */
export function flipOutcome(outcome: PairOutcome): PairOutcome {
  return outcome === "A" ? "B" : outcome === "B" ? "A" : "TIE";
}

export function flipVerdict(criteria: Record<string, PairOutcome>): Record<string, PairOutcome> {
  return Object.fromEntries(
    Object.entries(criteria).map(([key, outcome]) => [key, flipOutcome(outcome)]),
  );
}

export interface CombinedVerdict {
  criteria: Record<string, PairOutcome>;
  consistent: boolean;
  orders: number;
}

/**
 * Combines the canonical verdicts of both presentation orders. A criterion where the orders
 * disagree becomes a TIE: a preference that flips with position is position bias, not quality.
 * With only one valid order the verdict is used as is but not marked consistent. Returns null
 * when neither order produced a verdict.
 */
export function combineOrders(
  criterionKeys: string[],
  forward: Record<string, PairOutcome> | undefined,
  reverse: Record<string, PairOutcome> | undefined,
): CombinedVerdict | null {
  const verdicts = [forward, reverse].filter((verdict) => verdict !== undefined);
  if (verdicts.length === 0) return null;

  let consistent = verdicts.length === 2;
  const criteria: Record<string, PairOutcome> = {};
  for (const key of criterionKeys) {
    const outcomes = verdicts.map((verdict) => verdict[key] ?? "TIE");
    const agreed = outcomes.every((outcome) => outcome === outcomes[0]);
    if (!agreed) consistent = false;
    criteria[key] = agreed ? outcomes[0]! : "TIE";
  }
  return { criteria, consistent, orders: verdicts.length };
}

/** Overall pair winner: the side whose won criteria carry more weight. */
export function pairWinner(
  criteria: Record<string, PairOutcome>,
  weights: Map<string, number>,
): PairOutcome {
  let a = 0;
  let b = 0;
  for (const [key, outcome] of Object.entries(criteria)) {
    const weight = weights.get(key) ?? 0;
    if (outcome === "A") a += weight;
    else if (outcome === "B") b += weight;
  }
  if (Math.abs(a - b) < EPSILON) return "TIE";
  return a > b ? "A" : "B";
}

export interface Tally {
  wins: number;
  ties: number;
  losses: number;
}

export interface PairwiseStanding {
  /** Comparisons this response took part in. */
  comparisons: number;
  /** Overall pair results. */
  overall: Tally;
  criteria: Array<Tally & { key: string; score: number }>;
}

function sideOutcome(outcome: PairOutcome, side: "A" | "B"): keyof Tally {
  if (outcome === "TIE") return "ties";
  return outcome === side ? "wins" : "losses";
}

/**
 * Per-response standings from the valid comparisons. Responses that were in no valid comparison
 * are absent from the result (they cannot be scored).
 */
export function aggregatePairwise(
  comparisons: PairwiseRecord[],
  criterionKeys: string[],
): Map<string, PairwiseStanding> {
  const standings = new Map<string, PairwiseStanding>();
  const standingOf = (responseId: string) => {
    let standing = standings.get(responseId);
    if (!standing) {
      standing = {
        comparisons: 0,
        overall: { wins: 0, ties: 0, losses: 0 },
        criteria: criterionKeys.map((key) => ({ key, score: 0, wins: 0, ties: 0, losses: 0 })),
      };
      standings.set(responseId, standing);
    }
    return standing;
  };

  for (const comparison of comparisons) {
    for (const side of ["A", "B"] as const) {
      const standing = standingOf(side === "A" ? comparison.responseAId : comparison.responseBId);
      standing.comparisons += 1;
      standing.overall[sideOutcome(comparison.winner, side)] += 1;
      for (const entry of standing.criteria) {
        entry[sideOutcome(comparison.criteria[entry.key] ?? "TIE", side)] += 1;
      }
    }
  }

  for (const standing of standings.values()) {
    for (const entry of standing.criteria) {
      entry.score = ((entry.wins + entry.ties / 2) / standing.comparisons) * 10;
    }
  }
  return standings;
}
