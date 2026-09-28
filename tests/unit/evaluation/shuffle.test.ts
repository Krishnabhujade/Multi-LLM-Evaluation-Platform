import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "@/server/evaluation/scoring/cost";
import { anonLabel, seededRandom, seededShuffle } from "@/server/evaluation/shuffle";

describe("seededShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f"];

  it("is a permutation and is reproducible from the seed", () => {
    const first = seededShuffle(items, "seed-1");
    expect([...first].sort()).toEqual(items);
    expect(seededShuffle(items, "seed-1")).toEqual(first);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f"]); // input untouched
  });

  it("produces different orders for different seeds", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => seededShuffle(items, `s${i}`).join("")),
    );
    expect(orders.size).toBeGreaterThan(10);
  });

  it("does not systematically keep the first item first", () => {
    const firstStaysFirst = Array.from(
      { length: 400 },
      (_, i) => seededShuffle(items, `run-${i}`)[0] === "a",
    );
    const rate = firstStaysFirst.filter(Boolean).length / firstStaysFirst.length;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.26); // ≈ 1/6 expected
  });

  it("draws values in [0, 1)", () => {
    const random = seededRandom("x");
    for (let i = 0; i < 1_000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("anonLabel", () => {
  it("labels positions A, B, … Z, AA, AB", () => {
    expect([0, 1, 25, 26, 27].map(anonLabel)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("estimateCostUsd", () => {
  it("prices input and output tokens per million", () => {
    expect(
      estimateCostUsd(
        { inputTokens: 1_000, outputTokens: 2_000 },
        { inputPerMTok: 0.15, outputPerMTok: 0.6 },
      ),
    ).toBeCloseTo(0.00135);
  });

  it("returns null (N/A) when pricing or usage is unknown", () => {
    expect(estimateCostUsd({ inputTokens: 1, outputTokens: 1 }, undefined)).toBeNull();
    expect(estimateCostUsd({ inputTokens: 1 }, { inputPerMTok: 1, outputPerMTok: 1 })).toBeNull();
    expect(estimateCostUsd(undefined, { inputPerMTok: 1, outputPerMTok: 1 })).toBeNull();
  });

  it("is exactly zero for free models", () => {
    expect(
      estimateCostUsd(
        { inputTokens: 500, outputTokens: 900 },
        { inputPerMTok: 0, outputPerMTok: 0 },
      ),
    ).toBe(0);
  });
});
