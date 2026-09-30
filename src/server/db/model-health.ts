import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatModelRef } from "@/lib/model-ref";

export interface HealthOptions {
  windowHours?: number;
  /** Ignore models with fewer finished calls than this in the window. */
  minSamples?: number;
  maxFailureRate?: number;
  /** Models slower than this on average (successful calls) hold up every run they are in. */
  maxAvgLatencyMs?: number;
}

export interface ModelHealthRow {
  providerId: string;
  modelId: string;
  total: number;
  failures: number;
  successes: number;
  avgLatencyMs: number | null;
}

const DEFAULTS = {
  windowHours: 24,
  minSamples: 2,
  maxFailureRate: 0.5,
  maxAvgLatencyMs: 15_000,
} satisfies Required<HealthOptions>;

/** Pure part of the health check: which models failed too often or were too slow. */
export function unhealthyModelRefs(rows: ModelHealthRow[], options: HealthOptions = {}): string[] {
  const { minSamples, maxFailureRate, maxAvgLatencyMs } = { ...DEFAULTS, ...options };
  return rows
    .filter(
      (row) =>
        (row.total >= minSamples && row.failures / row.total >= maxFailureRate) ||
        (row.successes >= minSamples && (row.avgLatencyMs ?? 0) > maxAvgLatencyMs),
    )
    .map((row) => formatModelRef({ providerId: row.providerId, modelId: row.modelId }));
}

/**
 * Models that have recently been failing (e.g. an overloaded free tier) or very slow, as model
 * refs. The auto-select router avoids them when it has alternatives — health measured from this
 * platform's own recent calls rather than guessed.
 */
export async function getUnreliableModelRefs(
  prisma: PrismaClient,
  options: HealthOptions = {},
  now = new Date(),
): Promise<string[]> {
  const since = new Date(now.getTime() - (options.windowHours ?? DEFAULTS.windowHours) * 3_600_000);
  const rows = await prisma.$queryRaw<ModelHealthRow[]>`
    SELECT m."providerId", m."modelId",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE mr.status = 'FAILED')::int AS failures,
           COUNT(*) FILTER (WHERE mr.status = 'SUCCESS')::int AS successes,
           AVG(mr."latencyMs") FILTER (WHERE mr.status = 'SUCCESS')::float AS "avgLatencyMs"
    FROM model_responses mr
    JOIN models m ON m.id = mr."modelId"
    WHERE mr."createdAt" >= ${since} AND mr.status <> 'PENDING'
    GROUP BY m."providerId", m."modelId"
  `;
  return unhealthyModelRefs(rows, options);
}
