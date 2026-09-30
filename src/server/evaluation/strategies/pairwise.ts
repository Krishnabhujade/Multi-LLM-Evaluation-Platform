import type { RunCriterion } from "@/lib/api-types";
import {
  runStructuredJudge,
  type JudgeResult,
  type StructuredJudgeResult,
} from "@/server/evaluation/judge/judge-client";
import {
  parsePairwiseVerdict,
  type PairwiseVerdict,
} from "@/server/evaluation/judge/pairwise-parse";
import {
  buildPairwiseMessages,
  pairwiseRepairInstruction,
} from "@/server/evaluation/judge/pairwise-prompt";
import {
  aggregatePairwise,
  combineOrders,
  flipVerdict,
  pairWinner,
  type PairwiseStanding,
} from "@/server/evaluation/scoring/pairwise-aggregate";
import { StandardStrategy, type StrategyDeps } from "@/server/evaluation/strategies/standard";
import {
  createTaskGroup,
  evaluateAll,
  type EvaluationStrategy,
  type JudgingPlan,
  type JudgingSession,
  type StrategyCallbacks,
  type StrategySetup,
} from "@/server/evaluation/strategies/types";
import type { CandidateOutcome, PairwiseRecord } from "@/server/evaluation/types";
import type { Judgement } from "@/server/evaluation/judge/schema";
import { createLimiter } from "@/server/utils/limit";

export const pairCount = (candidates: number) => (candidates * (candidates - 1)) / 2;

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`;

/** Rewrites the positional "Response A/B" of a verdict to the run's anonymous labels. */
function relabel(text: string, first: CandidateOutcome, second: CandidateOutcome): string {
  return text.replace(
    /\b([Rr]esponse) ([AB])\b/g,
    (_match, word: string, position: string) =>
      `${word} ${position === "A" ? first.slot.anonLabel : second.slot.anonLabel}`,
  );
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Turns a response's head-to-head standing into the same judgement shape standard mode stores. */
export function describeStanding(standing: PairwiseStanding, criteria: RunCriterion[]): Judgement {
  const n = standing.comparisons;
  const nameOf = new Map(criteria.map((criterion) => [criterion.key, criterion.name]));
  const { wins, ties, losses } = standing.overall;
  return {
    scores: standing.criteria.map((entry) => ({
      key: entry.key,
      score: Math.round(entry.score * 100) / 100,
      reason: `Preferred in ${entry.wins} of ${plural(n, "head-to-head comparison")}; ${plural(entry.ties, "tie")}, ${plural(entry.losses, "loss", "losses")}.`,
    })),
    summary: `Won ${wins}, tied ${ties} and lost ${losses} of ${plural(n, "head-to-head comparison")} (scores are win rates × 10, ties count half).`,
    strengths: standing.criteria
      .filter((entry) => entry.score >= 7.5)
      .map((entry) => `${nameOf.get(entry.key) ?? entry.key}: preferred in ${entry.wins} of ${n}`),
    weaknesses: standing.criteria
      .filter((entry) => entry.score <= 2.5)
      .map((entry) => `${nameOf.get(entry.key) ?? entry.key}: lost ${entry.losses} of ${n}`),
  };
}

/**
 * Pairwise mode: every pair of responses is compared head-to-head by the judge, which picks A,
 * B or a tie per criterion. Each pair is judged in BOTH presentation orders; criteria where the
 * orders disagree become ties, which cancels position bias. Standings are aggregated into
 * per-criterion win-rate scores, so ranking and the UI are shared with standard mode.
 *
 * Costs n(n−1) judge calls for n responses, which is why requests cap pairwise runs at a few
 * models. With fewer than two successful responses there is nothing to compare, so the run
 * falls back to pointwise scoring. Pairs are judged as soon as both responses have arrived.
 */
export class PairwiseStrategy implements EvaluationStrategy {
  readonly mode = "PAIRWISE" as const;

  constructor(private readonly deps: StrategyDeps) {}

  plan(candidateCount: number): JudgingPlan {
    return candidateCount < 2
      ? { unit: "response", total: candidateCount }
      : { unit: "comparison", total: pairCount(candidateCount) };
  }

  start(setup: StrategySetup, callbacks: StrategyCallbacks): JudgingSession {
    const { run } = setup;
    const criterionKeys = run.criteria.map((criterion) => criterion.key);
    const weights = new Map(run.criteria.map((criterion) => [criterion.key, criterion.weight]));
    const limit = createLimiter(this.deps.concurrency);
    const tasks = createTaskGroup();
    const arrived: CandidateOutcome[] = [];
    const comparisons: PairwiseRecord[] = [];

    const compare = async (a: CandidateOutcome, b: CandidateOutcome) => {
      // Both orders are queued together so each comparison completes as early as possible.
      const [forward, reverse] = await Promise.all([
        limit(() => this.judgeOrder(setup, a, b)),
        limit(() => this.judgeOrder(setup, b, a)),
      ]);
      const combined = combineOrders(
        criterionKeys,
        forward.ok ? forward.value.criteria : undefined,
        reverse.ok ? flipVerdict(reverse.value.criteria) : undefined,
      );
      if (!combined) {
        const error = !forward.ok ? forward.error : !reverse.ok ? reverse.error : "no verdict";
        await callbacks.onComparison?.({
          ok: false,
          responseAId: a.slot.responseId,
          responseBId: b.slot.responseId,
          error,
        });
        return;
      }

      const comparison: PairwiseRecord = {
        responseAId: a.slot.responseId,
        responseBId: b.slot.responseId,
        winner: pairWinner(combined.criteria, weights),
        criteria: combined.criteria,
        consistent: combined.consistent,
        orders: combined.orders,
        summary: forward.ok
          ? relabel(forward.value.summary, a, b)
          : reverse.ok
            ? relabel(reverse.value.summary, b, a)
            : "",
        judgedBy: forward.ok ? forward.judgedBy : reverse.ok ? reverse.judgedBy : null,
      };
      comparisons.push(comparison);
      await callbacks.onComparison?.({ ok: true, comparison });
    };

    return {
      // A pair is judged as soon as both of its responses have arrived. Within a pair, the
      // canonical A is the response earlier in the seeded judging order, not the faster one.
      submit: (candidate) => {
        for (const other of arrived) {
          const [a, b] =
            other.slot.judgeOrder < candidate.slot.judgeOrder
              ? [other, candidate]
              : [candidate, other];
          tasks.add(compare(a, b));
        }
        arrived.push(candidate);
      },
      finish: async () => {
        if (arrived.length < 2) {
          return evaluateAll(new StandardStrategy(this.deps), setup, arrived, callbacks);
        }
        await tasks.settle();

        const standings = aggregatePairwise(comparisons, criterionKeys);
        const results = new Map<string, JudgeResult>();
        const ordered = [...arrived].sort((a, b) => a.slot.judgeOrder - b.slot.judgeOrder);
        for (const candidate of ordered) {
          const responseId = candidate.slot.responseId;
          const standing = standings.get(responseId);
          const judgedBy = mostCommon(
            comparisons
              .filter((c) => c.responseAId === responseId || c.responseBId === responseId)
              .flatMap((c) => (c.judgedBy ? [c.judgedBy] : [])),
          );
          const result: JudgeResult =
            standing && judgedBy
              ? { ok: true, judgedBy, judgement: describeStanding(standing, run.criteria) }
              : {
                  ok: false,
                  error: "No head-to-head comparison involving this response could be judged.",
                };
          results.set(responseId, result);
          await callbacks.onJudged(responseId, result);
        }
        return results;
      },
    };
  }

  /** One judge call: `first` is presented as Response A, `second` as Response B. */
  private judgeOrder(
    input: StrategySetup,
    first: CandidateOutcome,
    second: CandidateOutcome,
  ): Promise<StructuredJudgeResult<PairwiseVerdict>> {
    const { run } = input;
    const identity = (candidate: CandidateOutcome) =>
      run.blind ? undefined : `${candidate.slot.displayName} via ${candidate.slot.providerName}`;
    const criterionKeys = run.criteria.map((criterion) => criterion.key);

    return runStructuredJudge(
      {
        judgeRefs: input.judgeRefs,
        messages: buildPairwiseMessages({
          prompt: run.prompt,
          systemPrompt: run.systemPrompt,
          criteria: run.criteria,
          first: { content: first.content ?? "", identity: identity(first) },
          second: { content: second.content ?? "", identity: identity(second) },
        }),
        parse: (text) => parsePairwiseVerdict(text, criterionKeys),
        repair: (problem) => pairwiseRepairInstruction(problem, run.criteria),
      },
      {
        ...this.deps,
        // Trace rows are attributed to the response presented first in the call.
        onCall: (trace) => this.deps.onCall?.({ ...trace, responseId: first.slot.responseId }),
      },
    );
  }
}
