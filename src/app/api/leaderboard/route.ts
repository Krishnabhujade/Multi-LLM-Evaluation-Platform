import { parseLeaderboardQuery } from "@/lib/leaderboard";
import { getLeaderboard } from "@/server/db/leaderboard";
import { getPrisma } from "@/server/db/prisma";
import { apiHandler } from "@/server/http/handler";

/**
 * Per-model aggregates over completed evaluations on this platform. Query: `category`,
 * `range` (7d | 30d | 90d | all), `sort` ("overall" or a criterion key), `includeDemo`.
 */
export const GET = apiHandler(async (request) => {
  const query = parseLeaderboardQuery(new URL(request.url).searchParams);
  return Response.json(await getLeaderboard(getPrisma(), query));
});
