import { describe, expect, it } from "vitest";
import { resolveCatalogModels } from "@/server/llm/catalog";
import { invokeModel } from "@/server/llm/invoke";
import { DemoProvider } from "@/server/llm/providers/demo";
import type { GenerateRequest } from "@/server/llm/types";

const demo = (enabled = true) =>
  new DemoProvider({ enabled, models: resolveCatalogModels("demo"), latencyScale: 0 });

const ask = (model: string, content = "Explain how blockchain works"): GenerateRequest => ({
  model,
  messages: [{ role: "user", content }],
});

describe("DemoProvider", () => {
  it("is configured only when enabled and lists demo-flagged models", async () => {
    expect(demo(false).isConfigured()).toBe(false);
    const models = await demo().listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.isDemo && model.ref.startsWith("demo:"))).toBe(true);
  });

  it("returns deterministic, clearly labelled synthetic answers with usage", async () => {
    const provider = demo();
    const first = await provider.generate(ask("demo-concise"));
    const second = await provider.generate(ask("demo-concise"));
    expect(first.content).toBe(second.content);
    expect(first.content).toContain("demo model (development data)");
    expect(first.usage?.totalTokens).toBeGreaterThan(0);

    const verbose = await provider.generate(ask("demo-verbose"));
    expect(verbose.content.length).toBeGreaterThan(first.content.length * 2);
  });

  it("demo-flaky fails with a retryable 429 and succeeds on retry", async () => {
    const provider = demo();
    await expect(provider.generate(ask("demo-flaky"))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });
    await expect(provider.generate(ask("demo-flaky"))).resolves.toMatchObject({
      finishReason: "stop",
    });
  });

  it("recovers from demo-flaky through the retry policy", async () => {
    const outcome = await invokeModel(demo(), ask("demo-flaky", "flaky retry prompt"), {
      timeoutMs: 1_000,
      maxRetries: 2,
    });
    expect(outcome).toMatchObject({ ok: true, attempts: 2 });
  });

  it("demo-slow is cut off by the per-call timeout", async () => {
    const outcome = await invokeModel(demo(), ask("demo-slow"), { timeoutMs: 30, maxRetries: 2 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("TIMEOUT");
    expect(outcome.attempts).toBe(1); // timeouts are not retried
  });

  it("demo-judge scores exactly the criteria requested in the judge prompt", async () => {
    const prompt = [
      'Return JSON: { "criteria": { "accuracy": { "reasoning": "...", "score": 0 },',
      '"code_quality": { "reasoning": "...", "score": 0 } }, "summary": "..." }',
      "<candidate_response>",
      "- point one\n- point two",
      "</candidate_response>",
    ].join("\n");
    const result = await demo().generate(ask("demo-judge", prompt));
    const judgement = JSON.parse(result.content) as {
      criteria: Record<string, { score: number; reasoning: string }>;
    };
    expect(Object.keys(judgement.criteria).sort()).toEqual(["accuracy", "code_quality"]);
    for (const { score } of Object.values(judgement.criteria)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });

  it("rejects unknown demo models", async () => {
    await expect(demo().generate(ask("demo-nope"))).rejects.toMatchObject({
      code: "MODEL_NOT_FOUND",
    });
  });
});
