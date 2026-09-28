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
    });
  });
});

function validJudgement() {
  return JSON.stringify({
    criteria: Object.fromEntries(
      [
        "accuracy",
        "relevance",
        "clarity",
        "completeness",
        "conciseness",
        "instruction_following",
      ].map((key) => [key, { reasoning: `Reasoning for ${key}.`, score: 7 }]),
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
