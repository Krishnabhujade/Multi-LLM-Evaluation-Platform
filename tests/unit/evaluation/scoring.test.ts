import { describe, expect, it } from "vitest";
import { normalizeWeights, weightedOverall } from "@/server/evaluation/scoring/overall";
import { TIE_EPSILON, rankResponses, type RankInput } from "@/server/evaluation/scoring/ranking";

describe("weightedOverall", () => {
  it("matches the documented formula with the default weights", () => {
    // 8.5×0.25 + 9×0.20 + 9.5×0.15 + 8×0.15 + 7.5×0.10 + 9×0.15 = 8.65
    const overall = weightedOverall([
      { key: "accuracy", score: 8.5, weight: 25 },
      { key: "relevance", score: 9, weight: 20 },
      { key: "clarity", score: 9.5, weight: 15 },
      { key: "completeness", score: 8, weight: 15 },
      { key: "conciseness", score: 7.5, weight: 10 },
      { key: "instruction_following", score: 9, weight: 15 },
    ]);
    expect(overall).toBe(8.65);
  });

  it("does not require weights to sum to 100", () => {
    expect(
      weightedOverall([
        { key: "a", score: 10, weight: 3 },
        { key: "b", score: 4, weight: 1 },
      ]),
    ).toBe(8.5);
  });

  it("renormalizes over the criteria that were scored and ignores zero weights", () => {
    expect(
      weightedOverall([
        { key: "a", score: 6, weight: 50 },
        { key: "b", score: 0, weight: 0 },
      ]),
    ).toBe(6);
  });

  it("returns null when nothing can be weighted", () => {
    expect(weightedOverall([])).toBeNull();
    expect(weightedOverall([{ key: "a", score: 9, weight: 0 }])).toBeNull();
  });

  it("rounds to two decimals", () => {
    expect(
      weightedOverall([
        { key: "a", score: 7, weight: 1 },
        { key: "b", score: 8, weight: 2 },
      ]),
    ).toBe(7.67);
  });
});

describe("normalizeWeights", () => {
  it("returns shares that sum to 1", () => {
    const shares = normalizeWeights([{ weight: 25 }, { weight: 25 }, { weight: 50 }]).map(
      (w) => w.share,
    );
    expect(shares).toEqual([0.25, 0.25, 0.5]);
  });
});

const input = (
  responseId: string,
  overall: number | null,
  accuracy = 5,
  latencyMs = 1000,
): RankInput => ({
  responseId,
  overall,
  latencyMs,
  scores:
    overall === null
      ? []
      : [
          { key: "accuracy", score: accuracy, weight: 40 },
          { key: "clarity", score: 5, weight: 10 },
        ],
});

describe("rankResponses", () => {
  it("ranks by overall score and picks the highest as winner", () => {
    const result = rankResponses([
      input("a", 8.7),
      input("b", 7.9),
      input("c", 9.1),
      input("d", 8.3),
    ]);
    expect(result.winnerResponseId).toBe("c");
    expect(
      Object.fromEntries(result.entries.map((entry) => [entry.responseId, entry.rank])),
    ).toEqual({
      a: 2,
      b: 4,
      c: 1,
      d: 3,
    });
    expect(result.isTie).toBe(false);
  });

  it("breaks exact ties by the highest-weighted criterion, then latency", () => {
    expect(rankResponses([input("a", 8, 7), input("b", 8, 9)]).winnerResponseId).toBe("b");
    expect(
      rankResponses([input("slow", 8, 7, 3000), input("fast", 8, 7, 900)]).winnerResponseId,
    ).toBe("fast");
  });

  it("flags statistical ties with the runner-up", () => {
    expect(rankResponses([input("a", 8.5), input("b", 8.5 - TIE_EPSILON / 2)]).isTie).toBe(true);
    expect(rankResponses([input("a", 8.5), input("b", 8.4)]).isTie).toBe(false);
  });

  it("never ranks unscored responses", () => {
    const result = rankResponses([input("unscored", null), input("scored", 6)]);
    expect(result.winnerResponseId).toBe("scored");
    expect(result.entries.find((entry) => entry.responseId === "unscored")).toEqual({
      responseId: "unscored",
      overallScore: null,
      rank: null,
    });
  });

  it("has no winner when nothing was scored", () => {
    expect(rankResponses([input("a", null)])).toMatchObject({
      winnerResponseId: null,
      isTie: false,
    });
    expect(rankResponses([])).toMatchObject({ entries: [], winnerResponseId: null });
  });

  it("is independent of input order", () => {
    const entries = [input("a", 7), input("b", 9), input("c", 8)];
    expect(rankResponses(entries).entries.map((entry) => entry.rank)).toEqual(
      rankResponses([...entries].reverse())
        .entries.reverse()
        .map((entry) => entry.rank),
    );
  });
});
