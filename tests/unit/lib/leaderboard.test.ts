import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "@/lib/api-types";
import { parseHistoryQuery } from "@/lib/history-query";
import { parseLeaderboardQuery, rangeStart, rankLeaderboard } from "@/lib/leaderboard";
import { buildHistoryWhere } from "@/server/db/history";

const entry = (
  name: string,
  avgOverall: number | null,
  scored: number,
  criteria: Record<string, number> = {},
) =>
  ({
    model: {
      ref: `x:${name}`,
      providerId: "x",
      providerName: "X",
      modelId: name,
      displayName: name,
      isDemo: false,
    },
    responses: scored,
    scored,
    failures: 0,
    wins: 0,
    winRate: 0,
    failureRate: 0,
    avgOverall,
    avgLatencyMs: 1000,
    criteria,
    lowSample: scored < 5,
  }) satisfies LeaderboardEntry;

describe("rankLeaderboard", () => {
  const entries = [
    entry("B", 8.5, 10, { accuracy: 7 }),
    entry("A", 9.1, 3, { accuracy: 9 }),
    entry("C", null, 0),
    entry("D", 8.5, 20, { accuracy: 8 }),
  ];

  it("ranks by overall, breaking ties by sample size, unscored last", () => {
    expect(rankLeaderboard(entries, "overall").map((e) => e.model.displayName)).toEqual([
      "A",
      "D",
      "B",
      "C",
    ]);
  });

  it("ranks by a chosen criterion", () => {
    expect(rankLeaderboard(entries, "accuracy").map((e) => e.model.displayName)).toEqual([
      "A",
      "D",
      "B",
      "C",
    ]);
    expect(rankLeaderboard(entries, "clarity").map((e) => e.model.displayName)).toEqual([
      "D",
      "B",
      "A",
      "C",
    ]);
  });
});

describe("leaderboard query", () => {
  it("applies defaults and ignores invalid values", () => {
    expect(parseLeaderboardQuery(new URLSearchParams())).toEqual({
      category: undefined,
      range: "30d",
      sort: "overall",
      includeDemo: false,
    });
    expect(
      parseLeaderboardQuery(
        new URLSearchParams("category=NOPE&range=5y&sort=Robert';DROP&includeDemo=yes"),
      ),
    ).toEqual({ category: undefined, range: "30d", sort: "overall", includeDemo: false });
  });

  it("parses valid filters", () => {
    expect(
      parseLeaderboardQuery({
        category: "CODING",
        range: "7d",
        sort: "accuracy",
        includeDemo: "true",
      }),
    ).toEqual({
      category: "CODING",
      range: "7d",
      sort: "accuracy",
      includeDemo: true,
    });
  });

  it("computes range windows", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    expect(rangeStart("7d", now)?.toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("history query", () => {
  it("parses filters and bounds the page size", () => {
    expect(
      parseHistoryQuery(new URLSearchParams("category=CODING&q=%20kubernetes%20&limit=5")),
    ).toMatchObject({
      category: "CODING",
      q: "kubernetes",
      limit: 5,
    });
    expect(parseHistoryQuery(new URLSearchParams("limit=500")).limit).toBe(20);
    expect(parseHistoryQuery({ category: "bogus", q: "" })).toMatchObject({
      category: undefined,
      q: undefined,
      limit: 20,
    });
  });

  it("builds a where clause with case-insensitive prompt search", () => {
    expect(buildHistoryWhere({ category: "CODING", q: "api", status: undefined })).toEqual({
      category: "CODING",
      prompt: { contains: "api", mode: "insensitive" },
    });
    expect(buildHistoryWhere({}, { userId: "u1" })).toEqual({ userId: "u1" });
    expect(buildHistoryWhere({})).toEqual({});
  });
});
