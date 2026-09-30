import { CreateCriterionSchema } from "@/lib/criteria";
import { CriteriaRepository } from "@/server/db/criteria-repository";
import { getPrisma } from "@/server/db/prisma";
import { apiHandler } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/request";

/** Built-in criteria followed by the caller's custom criteria. */
export const GET = apiHandler(async () => {
  const criteria = await new CriteriaRepository(getPrisma()).list(null);
  return Response.json({ criteria });
});

/** Creates a custom criterion; its key is derived from the name and never changes. */
export const POST = apiHandler(async (request) => {
  const fields = CreateCriterionSchema.parse(await readJsonBody(request));
  const criterion = await new CriteriaRepository(getPrisma()).create(null, fields);
  return Response.json(criterion, { status: 201 });
});
