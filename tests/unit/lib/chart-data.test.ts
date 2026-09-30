import { describe, expect, it } from "vitest";
import {
  buildLatencyBars,
  buildOverallBars,
  buildRadarData,
  buildTokenBars,
  buildTraceRows,
  buildWinMatrix,
  scoredSeries,
} from "@/lib/chart-data";
import { callDetail, responseDetail, runDetail } from "../../helpers/run-detail";

const withScore =
  (key: string, score: number) =>
  <T extends { key: string; score: number }>(entry: T): T =>
    entry.key === key ? { ...entry, score } : entry;

describe("chart data", () => {
  const alpha = responseDetail("a", "Alpha", { overallScore: 7.5, latencyMs: 2400 });
  const beta = responseDetail("b", "Beta", {
    overallScore: 9.1,
    latencyMs: 900,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  });
  beta.scores = beta.scores.map(withScore("accuracy", 9.5));
  const failed = responseDetail("c", "Gamma", {
    status: "FAILED",
    errorCode: "TIMEOUT",
    latencyMs: 45_000,
    overallScore: null,
    rank: null,
    scores: [],
    judgeStatus: "SKIPPED",
  });
  const run = runDetail([alpha, beta, failed]);

  it("keeps series indices in selection order regardless of rank", () => {
    expect(scoredSeries(run)).toEqual([
      { id: "a", label: "Alpha", seriesIndex: 0 },
      { id: "b", label: "Beta", seriesIndex: 1 },
    ]);
    expect(buildOverallBars(run).map((bar) => [bar.id, bar.seriesIndex])).toEqual([
      ["b", 1],
      ["a", 0],
    ]);
  });

  it("pivots criterion scores into one radar row per criterion", () => {
    const rows = buildRadarData(run);
    expect(rows).toHaveLength(run.criteria.length);
    expect(rows[0]).toEqual({ criterion: "Accuracy", key: "accuracy", a: 8, b: 9.5 });
    expect(rows.every((row) => !("c" in row))).toBe(true); // failed responses have no scores
  });

  it("sorts latency fastest first and lists failures separately", () => {
    const { bars, failed: failures } = buildLatencyBars(run);
    expect(bars.map((bar) => [bar.id, bar.value])).toEqual([
      ["b", 900],
      ["a", 2400],
    ]);
    expect(failures).toEqual([
      { id: "c", label: "Gamma", seriesIndex: 2, errorCode: "TIMEOUT", latencyMs: 45_000 },
    ]);
  });

  it("splits token usage and reports models without usage data", () => {
    const { bars, missing } = buildTokenBars(run);
    expect(bars).toEqual([
      { id: "a", label: "Alpha", seriesIndex: 0, input: 100, output: 200, total: 300 },
    ]);
    expect(missing.map((row) => row.id)).toEqual(["b"]);
  });

  it("offsets trace rows from the first call and orders candidates before judges", () => {
    const traced = runDetail([alpha, beta], {
      calls: [
        callDetail({
          id: "j1",
          kind: "JUDGE",
          modelRef: "test:judge",
          responseId: "b",
          startedAt: "2026-09-29T10:00:03.000Z",
          latencyMs: 800,
        }),
        callDetail({
          id: "c2",
          modelRef: "test:b",
          responseId: "b",
          startedAt: "2026-09-29T10:00:00.500Z",
          latencyMs: 900,
        }),
        callDetail({
          id: "c1a",
          modelRef: "test:a",
          responseId: "a",
          status: "FAILED",
          errorCode: "RATE_LIMITED",
          startedAt: "2026-09-29T10:00:00.000Z",
          latencyMs: 300,
        }),
        callDetail({
          id: "c1b",
          modelRef: "test:a",
          responseId: "a",
          attempt: 2,
          startedAt: "2026-09-29T10:00:01.000Z",
          latencyMs: 1400,
        }),
      ],
    });
    const { rows, totalMs } = buildTraceRows(traced);

    expect(rows.map((row) => row.id)).toEqual(["c1a", "c1b", "c2", "j1"]);
    expect(rows[0]).toMatchObject({
      label: "Alpha",
      offsetMs: 0,
      status: "FAILED",
      errorCode: "RATE_LIMITED",
    });
    expect(rows[2]).toMatchObject({ label: "Beta", offsetMs: 500 });
    expect(rows[3]).toMatchObject({
      kind: "JUDGE",
      label: "Judge Model",
      subject: "Beta",
      offsetMs: 3000,
    });
    expect(totalMs).toBe(3800);
  });

  it("handles runs without calls", () => {
    expect(buildTraceRows(runDetail([alpha]))).toEqual({ rows: [], totalMs: 0 });
  });
});

describe("buildWinMatrix", () => {
  const a = responseDetail("a", "Alpha", { rank: 2, anonLabel: "B" });
  const b = responseDetail("b", "Beta", { rank: 1, anonLabel: "A" });
  const c = responseDetail("c", "Gamma", { rank: 3, anonLabel: "C" });
  const failed = responseDetail("d", "Delta", { status: "FAILED", rank: null });
  const allCriteria = (outcome: "A" | "B" | "TIE") =>
    Object.fromEntries(
      [
        "accuracy",
        "relevance",
        "clarity",
        "completeness",
        "conciseness",
        "instruction_following",
      ].map((key) => [key, outcome]),
    );
  const run = runDetail([a, b, c, failed], {
    mode: "PAIRWISE",
    pairwise: [
      {
        responseAId: "a",
        responseBId: "b",
        winner: "B",
        criteria: { ...allCriteria("B"), clarity: "TIE" },
        consistent: false,
        orders: 2,
        summary: "Response A is more accurate.",
        judgedBy: "test:judge",
      },
      {
        responseAId: "a",
        responseBId: "c",
        winner: "A",
        criteria: allCriteria("A"),
        consistent: true,
        orders: 2,
        summary: "",
        judgedBy: "test:judge",
      },
      {
        responseAId: "b",
        responseBId: "c",
        winner: "TIE",
        criteria: allCriteria("TIE"),
        consistent: true,
        orders: 1,
        summary: "",
        judgedBy: "test:judge",
      },
    ],
  });

  it("orders compared models by rank and keeps each model's series color", () => {
    const matrix = buildWinMatrix(run);
    expect(matrix.rows.map((row) => [row.label, row.seriesIndex])).toEqual([
      ["Beta", 1],
      ["Alpha", 0],
      ["Gamma", 2],
    ]);
  });

  it("shows every outcome from the row model's point of view", () => {
    const matrix = buildWinMatrix(run);
    expect(matrix.cells.b!.a).toMatchObject({
      outcome: "WIN",
      criteria: { won: 5, tied: 1, lost: 0 },
      consistent: false,
    });
    expect(matrix.cells.a!.b).toMatchObject({
      outcome: "LOSS",
      criteria: { won: 0, tied: 1, lost: 5 },
    });
    expect(matrix.cells.a!.b!.perCriterion[0]).toEqual({
      key: "accuracy",
      name: "Accuracy",
      outcome: "LOSS",
    });
    expect(matrix.cells.c!.b).toMatchObject({ outcome: "TIE", orders: 1 });
    expect(matrix.cells.a!.a).toBeUndefined();
  });

  it("tallies records and consistency", () => {
    const matrix = buildWinMatrix(run);
    expect(matrix.records).toEqual({
      a: { wins: 1, ties: 0, losses: 1 },
      b: { wins: 1, ties: 1, losses: 0 },
      c: { wins: 0, ties: 1, losses: 1 },
    });
    expect(matrix).toMatchObject({ consistentPairs: 2, totalPairs: 3 });
  });
});
