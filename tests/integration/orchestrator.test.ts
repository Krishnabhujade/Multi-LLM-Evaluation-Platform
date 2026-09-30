import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/run-events";
import {
  RunAlreadyStartedError,
  RunNotFoundError,
  claimRun,
  executeRun,
  type OrchestratorDeps,
} from "@/server/evaluation/orchestrator";
import { resolveCatalogModels } from "@/server/llm/catalog";
import { LLMError } from "@/server/llm/errors";
import { DemoProvider } from "@/server/llm/providers/demo";
import { ProviderRegistry } from "@/server/llm/registry";
import type { GenerateRequest } from "@/server/llm/types";
import { sleep } from "@/server/llm/resilience";
import { logger } from "@/server/observability/logger";
import { InMemoryRunStore, buildContext } from "../helpers/in-memory-store";
import { answerAfter, createScriptedProvider, failWith, hang } from "../helpers/scripted-provider";

/** The synthetic demo judge (instant) — every test registry includes it as `demo:demo-judge`. */
const demoJudge = () =>
  new DemoProvider({ enabled: true, models: resolveCatalogModels("demo"), latencyScale: 0 });

function setup(
  providers: ConstructorParameters<typeof ProviderRegistry>[0],
  overrides: Partial<OrchestratorDeps> = {},
) {
  const store = new InMemoryRunStore();
  const deps: OrchestratorDeps = {
    store,
    registry: new ProviderRegistry([...providers, demoJudge()]),
    timeoutMs: 200,
    maxRetries: 1,
    runBudgetMs: 10_000,
    logger,
    judge: { fallbackRefs: [], concurrency: 2, maxTokens: 1_000 },
    ...overrides,
  };
  return { store, deps };
}

async function run(deps: OrchestratorDeps, runId: string) {
  const events: RunEvent[] = [];
  await claimRun(deps.store, runId);
  await executeRun(runId, deps, (event) => events.push(event));
  return events;
}

describe("evaluation orchestrator — response collection", () => {
  it("calls every selected model concurrently, not sequentially", async () => {
    const { provider, stats } = createScriptedProvider("alpha", {
      one: answerAfter(40),
      two: answerAfter(40),
      three: answerAfter(40),
    });
    const { store, deps } = setup([provider]);
    const context = store.add(buildContext(["alpha:one", "alpha:two", "alpha:three"]));

    const events = await run(deps, context.run.id);

    expect(stats.maxInFlight).toBe(3);
    expect(store.run(context.run.id).status).toBe("COMPLETED");
    expect([...store.results.values()].every((result) => result.status === "SUCCESS")).toBe(true);
    expect(events[0]!.type).toBe("run.started");
    expect(events.at(-1)!.type).toBe("run.completed");
    expect(events.filter((event) => event.type === "model.completed")).toHaveLength(3);
  });

  it("keeps going when some models time out, are rate limited, down or unconfigured", async () => {
    const { provider } = createScriptedProvider("alpha", {
      ok: answerAfter(5, "The answer."),
      slow: hang,
      limited: failWith(
        () => new LLMError("RATE_LIMITED", "Too many requests", { retryAfterMs: 5 }),
      ),
      down: failWith(() => new LLMError("UNAVAILABLE", "503 upstream")),
    });
    const { provider: keyless } = createScriptedProvider(
      "beta",
      { model: answerAfter(5) },
      { configured: false },
    );
    const { store, deps } = setup([provider, keyless], { timeoutMs: 50 });
    const context = store.add(
      buildContext(["alpha:ok", "alpha:slow", "alpha:limited", "alpha:down", "beta:model"]),
    );

    const events = await run(deps, context.run.id);
    const byRef = (ref: string) =>
      store.results.get(context.slots.find((slot) => slot.modelRef === ref)!.responseId)!;

    expect(byRef("alpha:ok")).toMatchObject({ status: "SUCCESS", content: "The answer." });
    expect(byRef("alpha:slow")).toMatchObject({
      status: "FAILED",
      errorCode: "TIMEOUT",
      attempts: 1,
    });
    expect(byRef("alpha:limited")).toMatchObject({
      status: "FAILED",
      errorCode: "RATE_LIMITED",
      attempts: 2,
    });
    expect(byRef("alpha:down")).toMatchObject({
      status: "FAILED",
      errorCode: "UNAVAILABLE",
      attempts: 2,
    });
    expect(byRef("beta:model")).toMatchObject({ status: "FAILED", errorCode: "AUTH", attempts: 0 });

    expect(store.run(context.run.id).status).toBe("COMPLETED");
    expect(events.filter((event) => event.type === "model.failed")).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({ type: "run.completed" });
  });

  it("retries transient failures and traces every attempt", async () => {
    const { provider } = createScriptedProvider("alpha", {
      flaky: async (request, call) => {
        if (call === 1) throw new LLMError("UNAVAILABLE", "blip");
        return answerAfter(1, "Recovered", { inputTokens: 11, outputTokens: 22 })(request, call);
      },
    });
    const { store, deps } = setup([provider]);
    const context = store.add(
      buildContext([{ ref: "alpha:flaky", pricing: { inputPerMTok: 1, outputPerMTok: 2 } }]),
    );

    await run(deps, context.run.id);

    const result = store.results.get(context.slots[0]!.responseId)!;
    expect(result).toMatchObject({
      status: "SUCCESS",
      attempts: 2,
      usage: { inputTokens: 11, outputTokens: 22 },
    });
    expect(result.estimatedCostUsd).toBeCloseTo((11 * 1 + 22 * 2) / 1_000_000);
    const candidateCalls = store.calls.filter((call) => call.kind === "CANDIDATE");
    expect(candidateCalls.map((call) => [call.attempt, call.status, call.errorCode])).toEqual([
      [1, "FAILED", "UNAVAILABLE"],
      [2, "SUCCESS", undefined],
    ]);
    expect(candidateCalls[1]).toMatchObject({
      inputTokens: 11,
      outputTokens: 22,
      requestId: "req-test",
    });
  });

  it("fails the run when every model fails", async () => {
    const { provider } = createScriptedProvider("alpha", {
      a: failWith(() => new LLMError("AUTH", "bad key")),
      b: failWith(() => new LLMError("CONTENT_FILTERED", "blocked")),
    });
    const { store, deps } = setup([provider]);
    const context = store.add(buildContext(["alpha:a", "alpha:b"]));

    const events = await run(deps, context.run.id);

    expect(store.run(context.run.id)).toMatchObject({
      status: "FAILED",
      error: expect.stringContaining("Every model failed"),
    });
    expect(events.at(-1)).toMatchObject({ type: "run.failed" });
  });

  it("persists each result before announcing it", async () => {
    const { provider } = createScriptedProvider("alpha", { a: answerAfter(1), b: answerAfter(5) });
    const { store, deps } = setup([provider]);
    const context = store.add(buildContext(["alpha:a", "alpha:b"]));

    await claimRun(store, context.run.id);
    await executeRun(context.run.id, deps, (event) => {
      if (event.type === "model.completed" || event.type === "model.failed") {
        expect(store.results.has(event.responseId)).toBe(true);
      }
    });
  });

  it("isolates unexpected crashes to the affected model", async () => {
    const { provider } = createScriptedProvider("alpha", {
      ok: answerAfter(1),
      boom: answerAfter(1),
    });
    const { store, deps } = setup([provider]);
    const context = store.add(buildContext(["alpha:ok", "alpha:boom"]));
    const boomId = context.slots[1]!.responseId;

    // Simulate a persistence bug for one model only.
    const save = store.saveCandidateResult.bind(store);
    store.saveCandidateResult = async (responseId, result) => {
      if (responseId === boomId && result.status === "SUCCESS") throw new Error("disk full");
      return save(responseId, result);
    };

    const events = await run(deps, context.run.id);

    expect(store.results.get(context.slots[0]!.responseId)?.status).toBe("SUCCESS");
    expect(store.results.get(boomId)).toMatchObject({ status: "FAILED", errorCode: "UNKNOWN" });
    expect(store.run(context.run.id).status).toBe("COMPLETED");
    expect(
      events.some((event) => event.type === "model.failed" && event.responseId === boomId),
    ).toBe(true);
  });
});

describe("evaluation orchestrator — judging", () => {
  it("judges every successful response on every criterion and skips failed ones", async () => {
    const { provider } = createScriptedProvider("alpha", {
      good: answerAfter(1, "- point one\n- point two"),
      bad: failWith(() => new LLMError("UNAVAILABLE", "down")),
    });
    const { store, deps } = setup([provider], { maxRetries: 0 });
    const context = store.add(buildContext(["alpha:good", "alpha:bad"]));
    const [good, bad] = context.slots;

    const events = await run(deps, context.run.id);

    const judgement = store.judgements.get(good!.responseId);
    expect(judgement).toMatchObject({ status: "SCORED", judgedBy: "demo:demo-judge" });
    if (judgement?.status === "SCORED") {
      expect(judgement.scores.map((score) => score.key)).toEqual(
        context.run.criteria.map((c) => c.key),
      );
      expect(judgement.scores[0]).toMatchObject({ name: "Accuracy", weight: 25 });
    }
    expect(store.judgements.has(bad!.responseId)).toBe(false);

    expect(events.find((event) => event.type === "judging.started")).toMatchObject({ total: 1 });
    expect(events.find((event) => event.type === "judging.progress")).toMatchObject({
      responseId: good!.responseId,
      status: "SCORED",
      completed: 1,
      total: 1,
    });
    const judgeCalls = store.calls.filter((call) => call.kind === "JUDGE");
    expect(judgeCalls).toHaveLength(1);
    expect(judgeCalls[0]).toMatchObject({
      responseId: good!.responseId,
      modelDbId: "db_demo:demo-judge",
    });
  });

  it("keeps the judge blind to model identity and never leaks one candidate into another's prompt", async () => {
    const judgeRequests: GenerateRequest[] = [];
    const { provider: judge } = createScriptedProvider("judgeco", {
      judge: async (request) => {
        judgeRequests.push(request);
        return { content: validJudgement() };
      },
    });
    const { provider } = createScriptedProvider("alpha", {
      "secret-model-a": answerAfter(1, "Answer from A"),
      "secret-model-b": answerAfter(1, "Answer from B"),
    });
    const { store, deps } = setup([provider, judge]);
    const context = store.add(
      buildContext(["alpha:secret-model-a", "alpha:secret-model-b"], {
        judgeModelRef: "judgeco:judge",
      }),
    );

    await run(deps, context.run.id);

    expect(judgeRequests).toHaveLength(2);
    for (const request of judgeRequests) {
      const text = request.messages.map((message) => message.content).join("\n");
      expect(text).not.toMatch(/secret-model|alpha/);
      // Pointwise: each judge call contains exactly one candidate.
      expect(text.includes("Answer from A") !== text.includes("Answer from B")).toBe(true);
    }
  });

  it("falls back to the next judge and still completes when nothing can be scored", async () => {
    const { provider } = createScriptedProvider("alpha", { good: answerAfter(1) });
    const { provider: judges } = createScriptedProvider("judgeco", {
      broken: async () => ({ content: "Sorry, I can't do that." }),
      backup: async () => ({ content: validJudgement() }),
    });

    const withFallback = setup([provider, judges], {
      judge: { fallbackRefs: ["judgeco:backup"], concurrency: 1, maxTokens: 500 },
    });
    const first = withFallback.store.add(
      buildContext(["alpha:good"], { judgeModelRef: "judgeco:broken" }),
    );
    await run(withFallback.deps, first.run.id);
    expect(withFallback.store.judgements.get(first.slots[0]!.responseId)).toMatchObject({
      status: "SCORED",
      judgedBy: "judgeco:backup",
    });

    const noFallback = setup([provider, judges]);
    const second = noFallback.store.add(
      buildContext(["alpha:good"], { judgeModelRef: "judgeco:broken" }),
    );
    await run(noFallback.deps, second.run.id);
    expect(noFallback.store.judgements.get(second.slots[0]!.responseId)).toMatchObject({
      status: "FAILED",
    });
    expect(noFallback.store.run(second.run.id)).toMatchObject({
      status: "COMPLETED",
      error: "The judge could not score any response.",
      winnerResponseId: null,
    });
  });
});

describe("evaluation orchestrator — scoring and winner", () => {
  it("computes weighted overall scores, ranks responses and crowns the best one", async () => {
    // The scripted judge rewards the answer it is shown: A → 9, B → 6, C → 7.5.
    const scoreFor: Record<string, number> = { "Answer A": 9, "Answer B": 6, "Answer C": 7.5 };
    const { provider: judge } = createScriptedProvider("judgeco", {
      judge: async (request) => {
        const text = request.messages.at(-1)!.content;
        const answer = Object.keys(scoreFor).find((candidate) => text.includes(candidate))!;
        return { content: validJudgement(scoreFor[answer]) };
      },
    });
    const { provider } = createScriptedProvider("alpha", {
      a: answerAfter(1, "Answer A"),
      b: answerAfter(1, "Answer B"),
      c: answerAfter(1, "Answer C"),
      down: failWith(() => new LLMError("UNAVAILABLE", "down")),
    });
    const { store, deps } = setup([provider, judge], { maxRetries: 0 });
    const context = store.add(
      buildContext(["alpha:a", "alpha:b", "alpha:c", "alpha:down"], {
        judgeModelRef: "judgeco:judge",
      }),
    );
    const [a, b, c, down] = context.slots.map((slot) => slot.responseId);

    const events = await run(deps, context.run.id);

    expect(store.run(context.run.id)).toMatchObject({ status: "COMPLETED", winnerResponseId: a });
    expect(store.rankings.get(a!)).toEqual({ responseId: a, overallScore: 9, rank: 1 });
    expect(store.rankings.get(c!)).toMatchObject({ overallScore: 7.5, rank: 2 });
    expect(store.rankings.get(b!)).toMatchObject({ overallScore: 6, rank: 3 });
    expect(store.rankings.has(down!)).toBe(false); // failed responses are never ranked
    expect(events.at(-1)).toEqual({
      type: "run.completed",
      runId: context.run.id,
      winnerResponseId: a,
    });
  });
});

describe("evaluation orchestrator — judging overlaps model calls", () => {
  const indexOf = (events: RunEvent[], predicate: (event: RunEvent) => boolean) =>
    events.findIndex(predicate);

  it("judges fast responses while a slow model is still answering", async () => {
    const { provider } = createScriptedProvider("alpha", {
      fast: answerAfter(5, "Fast answer."),
      slow: answerAfter(200, "Slow answer."),
    });
    const { store, deps } = setup([provider], { timeoutMs: 2_000 });
    const context = store.add(buildContext(["alpha:fast", "alpha:slow"]));
    const [fast, slow] = context.slots.map((slot) => slot.responseId);

    const events = await run(deps, context.run.id);

    const fastJudged = indexOf(
      events,
      (event) => event.type === "judging.progress" && event.responseId === fast,
    );
    const slowDone = indexOf(
      events,
      (event) => event.type === "model.completed" && event.responseId === slow,
    );
    expect(fastJudged).toBeGreaterThan(-1);
    expect(fastJudged).toBeLessThan(slowDone);
    expect(store.run(context.run.id).status).toBe("COMPLETED");
    expect(store.judgements.get(slow!)).toMatchObject({ status: "SCORED" });
  });

  it("shrinks the judging plan when a model fails after judging started", async () => {
    const { provider } = createScriptedProvider("alpha", {
      fast: answerAfter(5),
      late: async (request) => {
        await sleep(100, request.signal);
        throw new LLMError("UNAVAILABLE", "went down");
      },
    });
    const { store, deps } = setup([provider], { maxRetries: 0 });
    const context = store.add(buildContext(["alpha:fast", "alpha:late"]));

    const events = await run(deps, context.run.id);

    expect(events.find((event) => event.type === "judging.started")).toMatchObject({
      total: 2,
      unit: "response",
    });
    expect(events.find((event) => event.type === "judging.planned")).toMatchObject({
      total: 1,
      unit: "response",
    });
    expect(store.run(context.run.id).status).toBe("COMPLETED");
  });

  it("compares a pair as soon as both of its responses have arrived", async () => {
    const { provider } = createScriptedProvider("alpha", {
      a: answerAfter(5, "Answer A"),
      b: answerAfter(5, "Answer B"),
      c: answerAfter(250, "Answer C"),
    });
    const { store, deps } = setup([provider], { timeoutMs: 2_000 });
    const context = store.add(
      buildContext(["alpha:a", "alpha:b", "alpha:c"], { mode: "PAIRWISE" }),
    );
    const c = context.slots[2]!.responseId;

    const events = await run(deps, context.run.id);

    const firstComparison = indexOf(events, (event) => event.type === "judging.progress");
    const cDone = indexOf(
      events,
      (event) => event.type === "model.completed" && event.responseId === c,
    );
    expect(firstComparison).toBeLessThan(cDone);
    expect(store.comparisons).toHaveLength(3);
    // Canonical A/B follows the seeded judging order, not arrival order.
    for (const comparison of store.comparisons) {
      const order = (id: string) =>
        context.slots.find((slot) => slot.responseId === id)!.judgeOrder;
      expect(order(comparison.responseAId)).toBeLessThan(order(comparison.responseBId));
    }
  });
});

describe("evaluation orchestrator — pairwise mode", () => {
  const CRITERIA = [
    "accuracy",
    "relevance",
    "clarity",
    "completeness",
    "conciseness",
    "instruction_following",
  ];
  const QUALITY: Record<string, number> = { "Answer A": 3, "Answer B": 1, "Answer C": 2 };
  const fenced = (text: string, tag: string) =>
    new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(text)?.[1] ?? "";
  const verdict = (winner: string) =>
    JSON.stringify({
      criteria: Object.fromEntries(
        CRITERIA.map((key) => [key, { reasoning: `Response ${winner} is better.`, winner }]),
      ),
      summary: `Response ${winner} is better than the other response.`,
    });
  /** A fair judge: prefers the better answer wherever it is shown. */
  const fairJudge = async (request: GenerateRequest) => {
    const text = request.messages.at(-1)!.content;
    const a = QUALITY[fenced(text, "response_a")]!;
    const b = QUALITY[fenced(text, "response_b")]!;
    return { content: verdict(a > b ? "A" : "B") };
  };

  function setupPairwise(judge: Parameters<typeof createScriptedProvider>[1][string]) {
    const { provider: judges } = createScriptedProvider("judgeco", { judge });
    const { provider } = createScriptedProvider("alpha", {
      a: answerAfter(1, "Answer A"),
      b: answerAfter(1, "Answer B"),
      c: answerAfter(1, "Answer C"),
      down: failWith(() => new LLMError("UNAVAILABLE", "down")),
    });
    return setup([provider, judges], { maxRetries: 0 });
  }

  it("judges every pair in both orders and ranks by head-to-head win rate", async () => {
    const { store, deps } = setupPairwise(fairJudge);
    const context = store.add(
      buildContext(["alpha:a", "alpha:b", "alpha:c", "alpha:down"], {
        mode: "PAIRWISE",
        judgeModelRef: "judgeco:judge",
      }),
    );
    const [a, b, c] = context.slots.map((slot) => slot.responseId);

    const events = await run(deps, context.run.id);

    // 3 successful responses → 3 pairs × 2 orders = 6 judge calls, all traced.
    const judgeCalls = store.calls.filter((call) => call.kind === "JUDGE");
    expect(judgeCalls).toHaveLength(6);
    expect(judgeCalls.every((call) => call.responseId)).toBe(true);

    expect(store.comparisons).toHaveLength(3);
    for (const comparison of store.comparisons) {
      expect(comparison).toMatchObject({ runId: context.run.id, consistent: true, orders: 2 });
    }
    const ab = store.comparisons.find((x) => x.responseAId === a && x.responseBId === b)!;
    expect(ab.winner).toBe("A");
    expect(Object.values(ab.criteria).every((outcome) => outcome === "A")).toBe(true);
    // Positional labels in the judge's summary are rewritten to the run's anonymous labels.
    expect(ab.summary).toBe("Response A is better than the other response.");
    const bc = store.comparisons.find((x) => x.responseAId === b && x.responseBId === c)!;
    expect(bc.winner).toBe("B");
    expect(bc.summary).toBe("Response C is better than the other response.");

    expect(store.run(context.run.id)).toMatchObject({ status: "COMPLETED", winnerResponseId: a });
    expect(store.rankings.get(a!)).toMatchObject({ overallScore: 10, rank: 1 });
    expect(store.rankings.get(c!)).toMatchObject({ overallScore: 5, rank: 2 });
    expect(store.rankings.get(b!)).toMatchObject({ overallScore: 0, rank: 3 });
    expect(store.judgements.get(a!)).toMatchObject({
      status: "SCORED",
      judgedBy: "judgeco:judge",
      summary: expect.stringMatching(/^Won 2, tied 0 and lost 0 of 2/),
    });

    expect(events.find((event) => event.type === "judging.started")).toMatchObject({
      unit: "comparison",
      total: 3,
    });
    const progress = events.filter((event) => event.type === "judging.progress");
    expect(progress.map((event) => event.type === "judging.progress" && event.completed)).toEqual([
      1, 2, 3,
    ]);
    expect(events.filter((event) => event.type === "response.judged")).toHaveLength(3);
  });

  it("turns a position-biased judge's verdicts into ties", async () => {
    const { store, deps } = setupPairwise(async () => ({ content: verdict("A") }));
    const context = store.add(
      buildContext(["alpha:a", "alpha:b"], { mode: "PAIRWISE", judgeModelRef: "judgeco:judge" }),
    );
    const [a, b] = context.slots.map((slot) => slot.responseId);

    await run(deps, context.run.id);

    expect(store.comparisons).toHaveLength(1);
    expect(store.comparisons[0]).toMatchObject({ winner: "TIE", consistent: false, orders: 2 });
    expect(store.rankings.get(a!)).toMatchObject({ overallScore: 5 });
    expect(store.rankings.get(b!)).toMatchObject({ overallScore: 5 });
  });

  it("uses the surviving order when one presentation order cannot be judged", async () => {
    const { store, deps } = setupPairwise(async (request, call) => {
      const text = request.messages.at(-1)!.content;
      if (fenced(text, "response_a") === "Answer B") {
        throw new LLMError("UNAVAILABLE", `judge down (call ${call})`);
      }
      return fairJudge(request);
    });
    const context = store.add(
      buildContext(["alpha:a", "alpha:b"], { mode: "PAIRWISE", judgeModelRef: "judgeco:judge" }),
    );

    await run(deps, context.run.id);

    expect(store.comparisons[0]).toMatchObject({ winner: "A", consistent: false, orders: 1 });
    expect(store.run(context.run.id)).toMatchObject({
      status: "COMPLETED",
      winnerResponseId: context.slots[0]!.responseId,
    });
  });

  it("falls back to pointwise scoring when only one response succeeds", async () => {
    const { store, deps } = setupPairwise(fairJudge);
    const context = store.add(buildContext(["alpha:a", "alpha:down"], { mode: "PAIRWISE" }));

    const events = await run(deps, context.run.id);

    expect(events.find((event) => event.type === "judging.started")).toMatchObject({
      unit: "response",
      total: 1,
    });
    expect(store.comparisons).toHaveLength(0);
    expect(store.judgements.get(context.slots[0]!.responseId)).toMatchObject({
      status: "SCORED",
      judgedBy: "demo:demo-judge",
    });
  });

  it("works end to end with the synthetic demo judge", async () => {
    const { store, deps } = setupPairwise(fairJudge);
    const context = store.add(
      buildContext(["alpha:a", "alpha:b", "alpha:c"], { mode: "PAIRWISE" }),
    );

    await run(deps, context.run.id);

    expect(store.comparisons).toHaveLength(3);
    // The demo judge's heuristics depend on content only, so both orders always agree.
    expect(store.comparisons.every((comparison) => comparison.consistent)).toBe(true);
    expect(store.run(context.run.id).status).toBe("COMPLETED");
    expect(store.rankings.size).toBe(3);
  });
});

function validJudgement(score = 7) {
  return JSON.stringify({
    criteria: Object.fromEntries(
      [
        "accuracy",
        "relevance",
        "clarity",
        "completeness",
        "conciseness",
        "instruction_following",
      ].map((key) => [key, { reasoning: `Reasoning for ${key}.`, score }]),
    ),
    summary: "Reasonable answer.",
  });
}

describe("claimRun", () => {
  it("lets a run execute exactly once", async () => {
    const { store } = setup([]);
    const context = store.add(buildContext(["alpha:a"]));

    await claimRun(store, context.run.id);
    await expect(claimRun(store, context.run.id)).rejects.toBeInstanceOf(RunAlreadyStartedError);
  });

  it("reports unknown runs", async () => {
    const { store } = setup([]);
    await expect(claimRun(store, "missing")).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
