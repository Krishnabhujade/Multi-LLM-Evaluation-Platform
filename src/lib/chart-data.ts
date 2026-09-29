import type { ResponseDetail, RunDetail } from "@/lib/api-types";

/**
 * Pure data shaping for the run-page charts. Kept free of React/Recharts so it can be unit
 * tested; components only map these rows onto marks.
 *
 * Every row carries `seriesIndex` — the model's position in the run's selection order — so a
 * model keeps the same color in every chart, the table and the cards (color follows the entity,
 * never its rank).
 */

export interface SeriesRow {
  id: string;
  label: string;
  seriesIndex: number;
}

function seriesOf(run: RunDetail): Map<string, SeriesRow> {
  return new Map(
    run.responses.map((response, index) => [
      response.id,
      { id: response.id, label: response.model.displayName, seriesIndex: index },
    ]),
  );
}

const scored = (response: ResponseDetail) => response.scores.length > 0;

/** Models that have criterion scores, in series order. */
export function scoredSeries(run: RunDetail): SeriesRow[] {
  const series = seriesOf(run);
  return run.responses.filter(scored).map((response) => series.get(response.id)!);
}

export type RadarRow = { criterion: string; key: string } & Record<string, number | string>;

/** One row per criterion; one numeric column per scored response (keyed by response id). */
export function buildRadarData(run: RunDetail): RadarRow[] {
  const responses = run.responses.filter(scored);
  return run.criteria.map((criterion) => {
    const row: RadarRow = { criterion: criterion.name, key: criterion.key };
    for (const response of responses) {
      const score = response.scores.find((entry) => entry.key === criterion.key)?.score;
      if (score !== undefined) row[response.id] = score;
    }
    return row;
  });
}

export interface ValueBar extends SeriesRow {
  value: number;
}

/** Overall score per scored response, best first. */
export function buildOverallBars(run: RunDetail): ValueBar[] {
  const series = seriesOf(run);
  return run.responses
    .filter((response) => response.overallScore !== null)
    .map((response) => ({ ...series.get(response.id)!, value: response.overallScore! }))
    .sort((a, b) => b.value - a.value);
}

export interface FailedEntry extends SeriesRow {
  errorCode: string | null;
  latencyMs: number | null;
}

/** Latency of successful responses (fastest first); failures are listed separately. */
export function buildLatencyBars(run: RunDetail): { bars: ValueBar[]; failed: FailedEntry[] } {
  const series = seriesOf(run);
  const bars = run.responses
    .filter((response) => response.status === "SUCCESS" && response.latencyMs !== null)
    .map((response) => ({ ...series.get(response.id)!, value: response.latencyMs! }))
    .sort((a, b) => a.value - b.value);
  const failed = run.responses
    .filter((response) => response.status === "FAILED")
    .map((response) => ({
      ...series.get(response.id)!,
      errorCode: response.errorCode,
      latencyMs: response.latencyMs,
    }));
  return { bars, failed };
}

export interface TokenBar extends SeriesRow {
  input: number;
  output: number;
  total: number;
}

/** Token usage for successful responses that reported it; the rest are listed as missing. */
export function buildTokenBars(run: RunDetail): { bars: TokenBar[]; missing: SeriesRow[] } {
  const series = seriesOf(run);
  const successes = run.responses.filter((response) => response.status === "SUCCESS");
  const bars = successes
    .filter((response) => response.inputTokens !== null || response.outputTokens !== null)
    .map((response) => {
      const input = response.inputTokens ?? 0;
      const output = response.outputTokens ?? 0;
      return { ...series.get(response.id)!, input, output, total: input + output };
    })
    .sort((a, b) => b.total - a.total);
  const missing = successes
    .filter((response) => response.inputTokens === null && response.outputTokens === null)
    .map((response) => series.get(response.id)!);
  return { bars, missing };
}

export interface TraceRow {
  id: string;
  kind: "CANDIDATE" | "JUDGE";
  /** Model that made the call. */
  label: string;
  /** For judge calls: the candidate being judged. */
  subject?: string;
  seriesIndex?: number;
  attempt: number;
  status: "SUCCESS" | "FAILED";
  errorCode: string | null;
  offsetMs: number;
  durationMs: number;
}

/**
 * Waterfall rows for every provider call attempt, offset from the first call. Candidate calls
 * come first (grouped by model, in series order), then judge calls in start order.
 */
export function buildTraceRows(run: RunDetail): { rows: TraceRow[]; totalMs: number } {
  if (run.calls.length === 0) return { rows: [], totalMs: 0 };

  const series = seriesOf(run);
  const origin = Math.min(...run.calls.map((call) => Date.parse(call.startedAt)));
  const modelName = (ref: string) =>
    ref === run.judgeModel.ref
      ? run.judgeModel.displayName
      : (run.responses.find((response) => response.model.ref === ref)?.model.displayName ?? ref);

  const rows: TraceRow[] = run.calls.map((call) => {
    const subject = call.responseId ? series.get(call.responseId) : undefined;
    return {
      id: call.id,
      kind: call.kind,
      label: modelName(call.modelRef),
      subject: call.kind === "JUDGE" ? subject?.label : undefined,
      seriesIndex: subject?.seriesIndex,
      attempt: call.attempt,
      status: call.status,
      errorCode: call.errorCode,
      offsetMs: Date.parse(call.startedAt) - origin,
      durationMs: call.latencyMs,
    };
  });

  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "CANDIDATE" ? -1 : 1;
    if (a.kind === "CANDIDATE") {
      return (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) || a.attempt - b.attempt;
    }
    return a.offsetMs - b.offsetMs;
  });

  const totalMs = Math.max(...rows.map((row) => row.offsetMs + row.durationMs));
  return { rows, totalMs };
}
