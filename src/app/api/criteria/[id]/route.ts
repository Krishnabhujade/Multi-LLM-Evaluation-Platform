import { UpdateCriterionSchema } from "@/lib/criteria";
import { CriteriaRepository } from "@/server/db/criteria-repository";
import { getPrisma } from "@/server/db/prisma";
import { apiHandler } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/request";

/** Updates a custom criterion (built-ins are read-only). Past runs keep their snapshot. */
export const PATCH = apiHandler<RouteContext<"/api/criteria/[id]">>(async (request, context) => {
  const { id } = await context.params;
  const patch = UpdateCriterionSchema.parse(await readJsonBody(request));
  const criterion = await new CriteriaRepository(getPrisma()).update(id, null, patch);
  return Response.json(criterion);
});

/** Deletes a custom criterion (built-ins are read-only). Past runs keep their snapshot. */
export const DELETE = apiHandler<RouteContext<"/api/criteria/[id]">>(async (_request, context) => {
  const { id } = await context.params;
  await new CriteriaRepository(getPrisma()).delete(id, null);
  return new Response(null, { status: 204 });
});
