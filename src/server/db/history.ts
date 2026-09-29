import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { RunListPage } from "@/lib/api-types";
import type { HistoryQuery } from "@/lib/history-query";

const PROMPT_EXCERPT = 200;

/** Filters → Prisma where clause. Pure, so it is unit-tested without a database. */
export function buildHistoryWhere(
  query: Partial<Pick<HistoryQuery, "category" | "status" | "q">>,
  scope: { userId?: string | null } = {},
): Prisma.EvaluationRunWhereInput {
  return {
    ...(scope.userId !== undefined && { userId: scope.userId }),
    ...(query.category && { category: query.category }),
    ...(query.status && { status: query.status }),
    ...(query.q && { prompt: { contains: query.q, mode: "insensitive" as const } }),
  };
}

/**
 * Newest-first, cursor-paginated history. Uses the (createdAt, id) ordering so pages are stable
 * while new runs are being added, and loads only what a summary row needs.
 */
export async function listRuns(
  prisma: PrismaClient,
  query: HistoryQuery,
  scope: { userId?: string | null } = {},
): Promise<RunListPage> {
  const rows = await prisma.evaluationRun.findMany({
    where: buildHistoryWhere(query, scope),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    select: {
      id: true,
      status: true,
      mode: true,
      category: true,
      prompt: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      autoSelected: true,
      responses: {
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          model: {
            select: { displayName: true, isDemo: true, provider: { select: { name: true } } },
          },
        },
      },
      winner: { select: { overallScore: true, model: { select: { displayName: true } } } },
    },
  });

  const page = rows.slice(0, query.limit);
  return {
    items: page.map((run) => ({
      id: run.id,
      status: run.status,
      mode: run.mode,
      category: run.category,
      prompt:
        run.prompt.length > PROMPT_EXCERPT
          ? `${run.prompt.slice(0, PROMPT_EXCERPT - 1)}…`
          : run.prompt,
      createdAt: run.createdAt.toISOString(),
      durationMs:
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : null,
      autoSelected: run.autoSelected,
      models: run.responses.map((response) => ({
        displayName: response.model.displayName,
        providerName: response.model.provider.name,
        isDemo: response.model.isDemo,
        failed: response.status === "FAILED",
      })),
      winner: run.winner
        ? { displayName: run.winner.model.displayName, overallScore: run.winner.overallScore }
        : null,
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
