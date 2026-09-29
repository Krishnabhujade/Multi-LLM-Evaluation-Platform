import { CreateEvaluationSchema } from "@/lib/evaluation-request";
import { parseHistoryQuery } from "@/lib/history-query";
import { listRuns } from "@/server/db/history";
import { getPrisma } from "@/server/db/prisma";
import { createEvaluation } from "@/server/evaluation/service";
import { apiHandler } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/request";

/**
 * Evaluation history, newest first. Query: `category`, `status`, `q` (prompt search),
 * `cursor` (from the previous page's `nextCursor`), `limit` (1–50).
 */
export const GET = apiHandler(async (request) => {
  const query = parseHistoryQuery(new URL(request.url).searchParams);
  return Response.json(await listRuns(getPrisma(), query));
});

/**
 * Creates an evaluation run (status PENDING) and returns its id. Execution is a separate call
 * (`POST /api/evaluations/:id/run`) so the client can navigate to the run page first and then
 * stream progress.
 */
export const POST = apiHandler(async (request, _context, { requestId }) => {
  const input = CreateEvaluationSchema.parse(await readJsonBody(request));
  const { id } = await createEvaluation(input, { requestId });
  return Response.json({ id, status: "PENDING" }, { status: 201 });
});
