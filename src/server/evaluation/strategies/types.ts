import type { EvaluationMode } from "@/lib/api-types";
import type { JudgeResult } from "@/server/evaluation/judge/judge-client";
import type { CandidateOutcome, PairwiseRecord, RunConfig } from "@/server/evaluation/types";

export interface StrategySetup {
  run: RunConfig;
  /** Primary judge first, then fallbacks. */
  judgeRefs: string[];
}

export type ComparisonResult =
  | { ok: true; comparison: PairwiseRecord }
  | { ok: false; responseAId: string; responseBId: string; error: string };

export interface StrategyCallbacks {
  /** Called as soon as one response's scores are final (persist + progress event). */
  onJudged(responseId: string, result: JudgeResult): Promise<void>;
  /** Pairwise mode: called as each head-to-head comparison finishes (persist + progress). */
  onComparison?(result: ComparisonResult): Promise<void>;
}

/** What one step of judging progress is, and how many there will be. */
export interface JudgingPlan {
  unit: "response" | "comparison";
  total: number;
}

/**
 * One run's judging. Successful candidates are submitted the moment they arrive, so judging
 * overlaps with slower models instead of waiting for the last one.
 */
export interface JudgingSession {
  submit(candidate: CandidateOutcome): void;
  /** Every candidate has settled: waits for outstanding judge calls and returns the results. */
  finish(): Promise<Map<string, JudgeResult>>;
}

/**
 * An evaluation strategy turns successful candidate responses into per-criterion scores (0–10).
 * Every strategy produces the same output shape, so scoring, ranking, storage and UI are shared;
 * adding a strategy means implementing this interface and registering it in `index.ts`.
 */
export interface EvaluationStrategy {
  readonly mode: EvaluationMode;
  /** The progress plan when `candidateCount` responses (will) have succeeded. */
  plan(candidateCount: number): JudgingPlan;
  start(setup: StrategySetup, callbacks: StrategyCallbacks): JudgingSession;
}

/** Judges a fixed set of candidates in one go. */
export function evaluateAll(
  strategy: EvaluationStrategy,
  setup: StrategySetup,
  candidates: CandidateOutcome[],
  callbacks: StrategyCallbacks,
): Promise<Map<string, JudgeResult>> {
  const session = strategy.start(setup, callbacks);
  for (const candidate of candidates) session.submit(candidate);
  return session.finish();
}

/**
 * Collects background tasks started before anyone awaits them. Failures are captured at once
 * (so they never surface as unhandled rejections) and rethrown by `settle()`.
 */
export function createTaskGroup() {
  const tasks: Array<Promise<void>> = [];
  let failure: { error: unknown } | undefined;
  return {
    add(task: Promise<unknown>) {
      tasks.push(
        task.then(
          () => undefined,
          (error: unknown) => {
            failure ??= { error };
          },
        ),
      );
    },
    async settle() {
      await Promise.all(tasks);
      if (failure) throw failure.error;
    },
  };
}
