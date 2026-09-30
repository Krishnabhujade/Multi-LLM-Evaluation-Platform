import { describe, expect, it } from "vitest";
import { unhealthyModelRefs, type ModelHealthRow } from "@/server/db/model-health";

const row = (modelId: string, overrides: Partial<ModelHealthRow>): ModelHealthRow => ({
  providerId: "openrouter",
  modelId,
  total: 4,
  failures: 0,
  successes: 4,
  avgLatencyMs: 3_000,
  ...overrides,
});

describe("unhealthyModelRefs", () => {
  it("flags models that fail often or respond very slowly", () => {
    const refs = unhealthyModelRefs([
      row("healthy", {}),
      row("failing", { failures: 2, successes: 2 }),
      row("slow", { avgLatencyMs: 18_300 }),
      row("all-failed", { failures: 4, successes: 0, avgLatencyMs: null }),
    ]);
    expect(refs).toEqual(["openrouter:failing", "openrouter:slow", "openrouter:all-failed"]);
  });

  it("needs enough samples before judging a model", () => {
    const refs = unhealthyModelRefs([
      row("one-failure", { total: 1, failures: 1, successes: 0, avgLatencyMs: null }),
      row("one-slow-call", { total: 1, successes: 1, avgLatencyMs: 30_000 }),
    ]);
    expect(refs).toEqual([]);
  });

  it("accepts custom thresholds", () => {
    expect(
      unhealthyModelRefs([row("model", { avgLatencyMs: 9_000 })], { maxAvgLatencyMs: 8_000 }),
    ).toEqual(["openrouter:model"]);
  });
});
