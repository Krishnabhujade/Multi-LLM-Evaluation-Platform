import { z } from "zod";
import { memoizeAsync } from "@/server/cache/memo";
import { inferCapabilities } from "@/server/llm/capabilities";
import type { CatalogModel, ModelPricing } from "@/server/llm/catalog";
import { OpenAICompatibleProvider } from "@/server/llm/providers/openai-compatible";
import type { ModelInfo } from "@/server/llm/types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const APP_TITLE = "Multi-LLM Evaluation Platform";

const ModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().nullish(),
      pricing: z
        .object({ prompt: z.string().optional(), completion: z.string().optional() })
        .optional(),
      architecture: z.object({ output_modalities: z.array(z.string()).optional() }).optional(),
    }),
  ),
});

interface DiscoveredModel {
  model: CatalogModel;
  free: boolean;
}

export interface OpenRouterOptions {
  apiKey: string | undefined;
  /** Curated catalog entries: preferred ordering, names and capability tags. */
  defaultModels: CatalogModel[];
  /** `OPENROUTER_MODELS` — when set, exactly these models are offered. */
  overrideIds: string[];
  /** Never offer paid models (guards against spending credits with the platform's key). */
  freeOnly: boolean;
  appUrl?: string;
  fetch?: typeof fetch;
  discoveryTtlMs?: number;
}

/**
 * OpenRouter — one key, many upstream models. Free (`:free`) models rotate frequently, so the
 * live list is discovered from `/models` (cached for an hour) instead of being hardcoded; the
 * curated catalog is the fallback when discovery fails.
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  private readonly discover: () => Promise<DiscoveredModel[] | undefined>;

  constructor(private readonly config: OpenRouterOptions) {
    super({
      id: "openrouter",
      displayName: "OpenRouter",
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: config.apiKey,
      models: config.defaultModels,
      supportsJsonMode: true,
      // App attribution headers recommended by OpenRouter.
      extraHeaders: {
        ...(config.appUrl && { "HTTP-Referer": config.appUrl }),
        "X-OpenRouter-Title": APP_TITLE,
        "X-Title": APP_TITLE,
      },
      fetch: config.fetch,
    });
    this.discover = memoizeAsync(() => this.fetchCatalog(), {
      ttlMs: config.discoveryTtlMs ?? 60 * 60 * 1000,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    return (await this.effectiveModels()).map((model) => this.toModelInfo(model));
  }

  private async effectiveModels(): Promise<CatalogModel[]> {
    const { defaultModels, overrideIds, freeOnly } = this.config;
    // No key, no discovery: nothing could be called anyway.
    const discovered = this.isConfigured() ? await this.discover() : undefined;
    const discoveredById = new Map(discovered?.map((entry) => [entry.model.modelId, entry]));
    const curatedById = new Map(defaultModels.map((model) => [model.modelId, model]));

    if (overrideIds.length > 0) {
      return overrideIds
        .filter((id) => !freeOnly || (discoveredById.get(id)?.free ?? id.endsWith(":free")))
        .map(
          (id) =>
            merge(curatedById.get(id), discoveredById.get(id)?.model) ?? {
              modelId: id,
              displayName: id,
              capabilities: inferCapabilities(id),
            },
        );
    }

    const free = (discovered ?? []).filter((entry) => entry.free);
    if (free.length === 0) return [...defaultModels];

    const models = free.map((entry) => merge(curatedById.get(entry.model.modelId), entry.model)!);
    const curatedOrder = (model: CatalogModel) => {
      const index = defaultModels.findIndex((curated) => curated.modelId === model.modelId);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return models.sort(
      (a, b) => curatedOrder(a) - curatedOrder(b) || a.displayName.localeCompare(b.displayName),
    );
  }

  private async fetchCatalog(): Promise<DiscoveredModel[]> {
    const response = await this.fetchImpl(`${OPENROUTER_BASE_URL}/models`, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`OpenRouter /models returned ${response.status}`);

    const { data } = ModelsResponseSchema.parse(await response.json());
    return data
      .filter((model) => !model.id.startsWith("openrouter/")) // meta-routers, not concrete models
      .filter((model) => (model.architecture?.output_modalities ?? ["text"]).includes("text"))
      .map((model) => {
        const pricing = perMillion(model.pricing?.prompt, model.pricing?.completion);
        const contextWindow = model.context_length ?? undefined;
        return {
          free:
            model.id.endsWith(":free") ||
            (pricing !== undefined && pricing.inputPerMTok === 0 && pricing.outputPerMTok === 0),
          model: {
            modelId: model.id,
            displayName: model.name ?? model.id,
            capabilities: inferCapabilities(model.id, model.name, contextWindow),
            contextWindow,
            pricing,
          },
        };
      });
  }
}

/** Curated metadata (name, capability tags) wins; live data (pricing, context) fills the rest. */
function merge(curated?: CatalogModel, discovered?: CatalogModel): CatalogModel | undefined {
  if (!curated) return discovered;
  if (!discovered) return curated;
  return {
    ...curated,
    contextWindow: discovered.contextWindow ?? curated.contextWindow,
    pricing: discovered.pricing ?? curated.pricing,
  };
}

/** OpenRouter prices are USD per token as strings; negative values mean "variable". */
function perMillion(prompt?: string, completion?: string): ModelPricing | undefined {
  const input = Number(prompt);
  const output = Number(completion);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0)
    return undefined;
  const round = (value: number) => Math.round(value * 1e6 * 1e6) / 1e6;
  return { inputPerMTok: round(input), outputPerMTok: round(output) };
}
