import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatModelRef } from "@/lib/model-ref";

export interface HealthOptions {
  windowHours?: number;
  /** Ignore models with fewer finished calls than this in the window. */
  minSamples?: number;
  maxFailureRate?: number;
}

/**
 * Models that have been failing recently (e.g. an overloaded free tier), as model refs. The
 * auto-select router avoids them when it has alternatives — "availability" measured from this
 * platform's own recent calls rather than guessed.
 */
export async function getUnreliableModelRefs(
  prisma: PrismaClient,
  { windowHours = 24, minSamples = 2, maxFailureRate = 0.5 }: HealthOptions = {},
  now = new Date(),
): Promise<string[]> {
  const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ providerId: string; modelId: string; total: number; failures: number }>
  >`
    SELECT m."providerId", m."modelId",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE mr.status = 'FAILED')::int AS failures
    FROM model_responses mr
    JOIN models m ON m.id = mr."modelId"
    WHERE mr."createdAt" >= ${since} AND mr.status <> 'PENDING'
    GROUP BY m."providerId", m."modelId"
  `;
  return rows
    .filter((row) => row.total >= minSamples && row.failures / row.total >= maxFailureRate)
    .map((row) => formatModelRef({ providerId: row.providerId, modelId: row.modelId }));
}
