import { describe, expect, it } from "vitest";
import {
  buildLatencyBars,
  buildOverallBars,
  buildRadarData,
  buildTokenBars,
  buildTraceRows,
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
