import { apiHandler } from "@/server/http/handler";
import { getProviderRegistry } from "@/server/llm/registry";

/** Provider availability. Reports only whether a key is configured — never the key itself. */
export const GET = apiHandler(async () => {
  const registry = getProviderRegistry();
  const models = await registry.listModels({ includeUnavailable: true });

  const providers = registry.summaries().map((provider) => ({
    ...provider,
    modelCount: models.filter((model) => model.providerId === provider.id).length,
  }));

  return Response.json({ providers });
});
