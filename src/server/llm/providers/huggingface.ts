import { z } from "zod";
import { memoizeAsync } from "@/server/cache/memo";
import type { CatalogModel, ModelPricing } from "@/server/llm/catalog";
import { OpenAICompatibleProvider } from "@/server/llm/providers/openai-compatible";
import type { ModelInfo } from "@/server/llm/types";

export const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";

const RouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      providers: z
        .array(
          z.object({
            provider: z.string(),
            status: z.string().optional(),
            context_length: z.number().nullish(),
            pricing: z
              .object({ input: z.number().nullish(), output: z.number().nullish() })
              .nullish(),
            throughput: z.number().nullish(),
          }),
        )
        .optional(),
    }),
  ),
});

export interface RouterOffer {
  provider: string;
  live: boolean;
  contextWindow?: number;
  pricing?: ModelPricing;
  throughput?: number;
}

/**
 * Hugging Face Inference Providers router — OpenAI-compatible access to open models served by
 * partner providers. The model id suffix selects the serving provider (`:cheapest`,
 * `:fastest`, or an explicit provider such as `:groq`); pricing and context window are read
 * from the router's `/models` endpoint for whichever provider that policy would pick.
 */
export class HuggingFaceProvider extends OpenAICompatibleProvider {
  private readonly served: () => Promise<Map<string, RouterOffer[]> | undefined>;

  constructor(options: {
    apiKey: string | undefined;
    models: CatalogModel[];
    fetch?: typeof fetch;
    discoveryTtlMs?: number;
  }) {
    super({
      id: "huggingface",
      displayName: "Hugging Face",
      baseUrl: HF_ROUTER_BASE_URL,
      apiKey: options.apiKey,
      models: options.models,
      // Structured-output support varies by serving provider; the judge parser tolerates prose.
      supportsJsonMode: false,
      fetch: options.fetch,
    });
    this.served = memoizeAsync(() => this.fetchServedModels(), {
      ttlMs: options.discoveryTtlMs ?? 60 * 60 * 1000,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const served = this.isConfigured() ? await this.served() : undefined;
    return this.options.models.map((model) => {
      const info = this.toModelInfo(model);
      const offer = served ? pickOffer(model.modelId, served) : undefined;
      return {
        ...info,
        contextWindow: info.contextWindow ?? offer?.contextWindow,
        pricing: info.pricing ?? offer?.pricing,
      };
    });
  }

  private async fetchServedModels(): Promise<Map<string, RouterOffer[]>> {
    const response = await this.fetchImpl(`${HF_ROUTER_BASE_URL}/models`, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Hugging Face /models returned ${response.status}`);

    const { data } = RouterModelsSchema.parse(await response.json());
    return new Map(
      data.map((model) => [
        model.id,
        (model.providers ?? []).map((offer) => ({
          provider: offer.provider,
          live: offer.status === undefined || offer.status === "live",
          contextWindow: offer.context_length ?? undefined,
          pricing:
            offer.pricing?.input != null && offer.pricing.output != null
              ? { inputPerMTok: offer.pricing.input, outputPerMTok: offer.pricing.output }
              : undefined,
          throughput: offer.throughput ?? undefined,
        })),
      ]),
    );
  }
}

/** Mirrors the router's provider-selection policy to predict who serves a model id. */
export function pickOffer(
  modelId: string,
  served: Map<string, RouterOffer[]>,
): RouterOffer | undefined {
  const separator = modelId.lastIndexOf(":");
  const baseId = separator > 0 ? modelId.slice(0, separator) : modelId;
  const policy = separator > 0 ? modelId.slice(separator + 1) : "fastest";
  const offers = (served.get(baseId) ?? []).filter((offer) => offer.live);

  if (policy === "cheapest") {
    const cost = (offer: RouterOffer) => offer.pricing!.inputPerMTok + offer.pricing!.outputPerMTok;
    return offers
      .filter((offer) => offer.pricing)
      .reduce<RouterOffer | undefined>(
        (best, offer) => (!best || cost(offer) < cost(best) ? offer : best),
        undefined,
      );
  }
  if (policy === "fastest" || policy === "preferred") {
    return offers.reduce<RouterOffer | undefined>(
      (best, offer) => (!best || (offer.throughput ?? 0) > (best.throughput ?? 0) ? offer : best),
      undefined,
    );
  }
  return offers.find((offer) => offer.provider === policy);
}
