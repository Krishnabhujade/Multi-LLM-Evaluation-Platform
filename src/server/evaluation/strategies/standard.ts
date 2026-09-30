import { buildPointwiseMessages } from "@/server/evaluation/judge/prompt";
import {
  runJudge,
  type JudgeClientDeps,
  type JudgeResult,
} from "@/server/evaluation/judge/judge-client";
import {
  createTaskGroup,
  type EvaluationStrategy,
  type JudgingPlan,
  type JudgingSession,
  type StrategyCallbacks,
  type StrategySetup,
} from "@/server/evaluation/strategies/types";
import type { CandidateOutcome } from "@/server/evaluation/types";
import { createLimiter } from "@/server/utils/limit";

export type StrategyDeps = JudgeClientDeps & { concurrency: number };

/**
 * Standard mode: the same judge scores every response independently (pointwise), one response
 * per call. Pointwise judging avoids the position bias of showing several answers side by side,
 * and lets each response be judged the moment it arrives. Calls are concurrency-limited to
 * respect free-tier rate limits.
 */
export class StandardStrategy implements EvaluationStrategy {
  readonly mode = "STANDARD" as const;

  constructor(private readonly deps: StrategyDeps) {}

  plan(candidateCount: number): JudgingPlan {
    return { unit: "response", total: candidateCount };
  }

  start(setup: StrategySetup, callbacks: StrategyCallbacks): JudgingSession {
    const limit = createLimiter(this.deps.concurrency);
    const results = new Map<string, JudgeResult>();
    const tasks = createTaskGroup();

    return {
      submit: (candidate) => {
        tasks.add(
          limit(async () => {
            const result = await this.judge(setup, candidate);
            results.set(candidate.slot.responseId, result);
            await callbacks.onJudged(candidate.slot.responseId, result);
          }),
        );
      },
      finish: async () => {
        await tasks.settle();
        return results;
      },
    };
  }

  private judge({ run, judgeRefs }: StrategySetup, candidate: CandidateOutcome) {
    const messages = buildPointwiseMessages({
      prompt: run.prompt,
      systemPrompt: run.systemPrompt,
      criteria: run.criteria,
      label: candidate.slot.anonLabel,
      content: candidate.content ?? "",
      identity: run.blind
        ? undefined
        : { displayName: candidate.slot.displayName, providerName: candidate.slot.providerName },
    });
    return runJudge(
      { judgeRefs, messages, criteria: run.criteria },
      {
        ...this.deps,
        onCall: (trace) => this.deps.onCall?.({ ...trace, responseId: candidate.slot.responseId }),
      },
    );
  }
}
