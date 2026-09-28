import { apiHandler } from "@/server/http/handler";
import { getProviderRegistry } from "@/server/llm/registry";

/**
 * Model catalog with availability. `?all=true` also returns models whose provider has no API key
 * (useful for the models page); by default only callable models are listed.
 */
export const GET = apiHandler(async (request) => {
  const includeUnavailable = new URL(request.url).searchParams.get("all") === "true";
  const models = await getProviderRegistry().listModels({ includeUnavailable });
  return Response.json({ models });
});
