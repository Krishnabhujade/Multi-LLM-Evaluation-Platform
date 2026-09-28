import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/run-events";
import {
  RunAlreadyStartedError,
  RunNotFoundError,
  claimRun,
  executeRun,
  type OrchestratorDeps,
} from "@/server/evaluation/orchestrator";
import { LLMError } from "@/server/llm/errors";
import { ProviderRegistry } from "@/server/llm/registry";
import { logger } from "@/server/observability/logger";
import { InMemoryRunStore, buildContext } from "../helpers/in-memory-store";
import { answerAfter, createScriptedProvider, failWith, hang } from "../helpers/scripted-provider";

function setup(
  providers: ConstructorParameters<typeof ProviderRegistry>[0],
  overrides: Partial<OrchestratorDeps> = {},
) {
  const store = new InMemoryRunStore();
  const deps: OrchestratorDeps = {
    store,
    registry: new ProviderRegistry(providers),
    timeoutMs: 200,
    maxRetries: 1,
    runBudgetMs: 10_000,
    logger,
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
    expect(store.calls.map((call) => [call.attempt, call.status, call.errorCode])).toEqual([
      [1, "FAILED", "UNAVAILABLE"],
      [2, "SUCCESS", undefined],
    ]);
    expect(store.calls[1]).toMatchObject({
      kind: "CANDIDATE",
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
