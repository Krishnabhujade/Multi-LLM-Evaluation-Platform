import { getEvaluation } from "@/server/evaluation/service";
import { ApiError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";

/** Full result of one evaluation: config, every response, criterion scores and the call trace. */
export const GET = apiHandler<RouteContext<"/api/evaluations/[id]">>(async (_request, context) => {
  const { id } = await context.params;
  const run = await getEvaluation(id);
  if (!run) throw new ApiError(404, "NOT_FOUND", "Evaluation not found");
  return Response.json(run);
});
