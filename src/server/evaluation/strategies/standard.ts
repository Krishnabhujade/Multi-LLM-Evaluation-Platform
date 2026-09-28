import { buildPointwiseMessages } from "@/server/evaluation/judge/prompt";
import {
  runJudge,
  type JudgeClientDeps,
  type JudgeResult,
} from "@/server/evaluation/judge/judge-client";
import type {
  EvaluationStrategy,
  StrategyCallbacks,
  StrategyInput,
} from "@/server/evaluation/strategies/types";
import { createLimiter } from "@/server/utils/limit";

/**
 * Standard mode: the same judge scores every response independently (pointwise), one response
 * per call. Pointwise judging avoids the position bias of showing several answers side by side;
 * calls are dispatched in the run's seeded-shuffle order and concurrency-limited to respect
 * free-tier rate limits.
 */
export class StandardStrategy implements EvaluationStrategy {
  readonly mode = "STANDARD" as const;

  constructor(private readonly deps: JudgeClientDeps & { concurrency: number }) {}

  async evaluate(
    input: StrategyInput,
    callbacks: StrategyCallbacks,
  ): Promise<Map<string, JudgeResult>> {
    const limit = createLimiter(this.deps.concurrency);
    const results = new Map<string, JudgeResult>();
    const ordered = [...input.candidates].sort((a, b) => a.slot.judgeOrder - b.slot.judgeOrder);

    await Promise.all(
      ordered.map((candidate) =>
        limit(async () => {
          const messages = buildPointwiseMessages({
            prompt: input.run.prompt,
            systemPrompt: input.run.systemPrompt,
            criteria: input.run.criteria,
            label: candidate.slot.anonLabel,
            content: candidate.content ?? "",
            identity: input.run.blind
              ? undefined
              : {
                  displayName: candidate.slot.displayName,
                  providerName: candidate.slot.providerName,
                },
          });
          const result = await runJudge(
            { judgeRefs: input.judgeRefs, messages, criteria: input.run.criteria },
            {
              ...this.deps,
              onCall: (trace) =>
                this.deps.onCall?.({ ...trace, responseId: candidate.slot.responseId }),
            },
          );
          results.set(candidate.slot.responseId, result);
          await callbacks.onJudged(candidate.slot.responseId, result);
        }),
      ),
    );
    return results;
  }
}
