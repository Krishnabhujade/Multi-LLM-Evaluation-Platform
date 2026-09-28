import { CreateEvaluationSchema } from "@/lib/evaluation-request";
import { claimRun, executeRun } from "@/server/evaluation/orchestrator";
import { createEvaluation, getEvaluation, getOrchestratorDeps } from "@/server/evaluation/service";
import { apiHandler } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/request";

export const maxDuration = 300;

/**
 * One-shot synchronous evaluation for API clients and scripts: create, run to completion and
 * return the full result (same shape as `GET /api/evaluations/:id`). The UI uses the streaming
 * endpoints instead so it can show live progress.
 */
export const POST = apiHandler(async (request, _context, { requestId }) => {
  const input = CreateEvaluationSchema.parse(await readJsonBody(request));
  const { id } = await createEvaluation(input, { requestId });

  const deps = getOrchestratorDeps();
  await claimRun(deps.store, id);
  await executeRun(id, deps, () => undefined);

  return Response.json(await getEvaluation(id));
});
