import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Leaderboard, LeaderboardEntry } from "@/lib/api-types";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import {
  MIN_LEADERBOARD_SAMPLE,
  rankLeaderboard,
  rangeStart,
  type LeaderboardQuery,
} from "@/lib/leaderboard";
import { formatModelRef } from "@/lib/model-ref";

interface Row {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  providerName: string;
  isDemo: boolean;
  responses: number;
  scored: number;
  failures: number;
  wins: number;
  avgOverall: number | null;
  avgLatencyMs: number | null;
  criteria: Record<string, number> | null;
}

/**
 * Per-model aggregates over completed runs in scope, in one round trip.
 *
 * `scoped` selects the relevant responses once; response-level metrics and criterion averages
 * are aggregated in separate CTEs and joined afterwards, so joining criterion scores cannot
 * multiply response rows (which would skew averages and counts).
 */
export async function getLeaderboard(
  prisma: PrismaClient,
  query: LeaderboardQuery,
  now = new Date(),
): Promise<Leaderboard> {
  const since = rangeStart(query.range, now);
  const filters = [
    Prisma.sql`r.status = 'COMPLETED'`,
    ...(query.category ? [Prisma.sql`r.category = ${query.category}::"TaskCategory"`] : []),
    ...(since ? [Prisma.sql`r."createdAt" >= ${since}`] : []),
  ];
  const demoFilter = query.includeDemo ? Prisma.empty : Prisma.sql`WHERE NOT m."isDemo"`;

  const rows = await prisma.$queryRaw<Row[]>`
    WITH scoped AS (
      SELECT mr.id, mr."modelId", mr.status, mr."overallScore", mr."latencyMs",
             (r."winnerResponseId" = mr.id) AS won
      FROM model_responses mr
      JOIN evaluation_runs r ON r.id = mr."runId"
      WHERE ${Prisma.join(filters, " AND ")}
    ),
    per_model AS (
      SELECT "modelId",
             COUNT(*)::int AS responses,
             COUNT("overallScore")::int AS scored,
             COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failures,
             COUNT(*) FILTER (WHERE won)::int AS wins,
             AVG("overallScore")::float AS "avgOverall",
             AVG("latencyMs") FILTER (WHERE status = 'SUCCESS')::float AS "avgLatencyMs"
      FROM scoped
      GROUP BY "modelId"
    ),
    per_criterion AS (
      SELECT s."modelId", cs."criterionKey" AS key, AVG(cs.score)::float AS avg
      FROM scoped s
      JOIN criterion_scores cs ON cs."responseId" = s.id
      GROUP BY s."modelId", cs."criterionKey"
    ),
    criteria_json AS (
      SELECT "modelId", jsonb_object_agg(key, avg) AS criteria
      FROM per_criterion
      GROUP BY "modelId"
    )
    SELECT m.id, m."providerId", m."modelId", m."displayName", p.name AS "providerName", m."isDemo",
           pm.responses, pm.scored, pm.failures, pm.wins, pm."avgOverall", pm."avgLatencyMs",
           cj.criteria
    FROM per_model pm
    JOIN models m ON m.id = pm."modelId"
    JOIN providers p ON p.id = m."providerId"
    LEFT JOIN criteria_json cj ON cj."modelId" = pm."modelId"
    ${demoFilter}
  `;

  const runFilters = [...filters];
  const [{ count: totalRuns } = { count: 0 }] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM evaluation_runs r WHERE ${Prisma.join(runFilters, " AND ")}
  `;

  const entries: LeaderboardEntry[] = rows.map((row) => ({
    model: {
      ref: formatModelRef({ providerId: row.providerId, modelId: row.modelId }),
      providerId: row.providerId,
      providerName: row.providerName,
      modelId: row.modelId,
      displayName: row.displayName,
      isDemo: row.isDemo,
    },
    responses: row.responses,
    scored: row.scored,
    failures: row.failures,
    wins: row.wins,
    winRate: row.responses > 0 ? row.wins / row.responses : null,
    failureRate: row.responses > 0 ? row.failures / row.responses : null,
    avgOverall: row.avgOverall,
    avgLatencyMs: row.avgLatencyMs,
    criteria: row.criteria ?? {},
    lowSample: row.scored < MIN_LEADERBOARD_SAMPLE,
  }));

  // Built-in criteria first (in their canonical order), then any custom keys present.
  const present = new Set(entries.flatMap((entry) => Object.keys(entry.criteria)));
  const criterionKeys = [
    ...BUILT_IN_CRITERIA.filter((criterion) => present.has(criterion.key)).map((criterion) => ({
      key: criterion.key,
      name: criterion.name,
    })),
    ...[...present]
      .filter((key) => !BUILT_IN_CRITERIA.some((criterion) => criterion.key === key))
      .sort()
      .map((key) => ({ key, name: key.replaceAll("_", " ") })),
  ];

  return { entries: rankLeaderboard(entries, query.sort), criterionKeys, totalRuns };
}
