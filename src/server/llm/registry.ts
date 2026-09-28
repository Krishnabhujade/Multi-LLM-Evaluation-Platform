import "server-only";
import { parseModelRef } from "@/lib/model-ref";
import { getEnv, type Env } from "@/server/env";
import { resolveCatalogModels } from "@/server/llm/catalog";
import { DemoProvider } from "@/server/llm/providers/demo";
import { GeminiProvider } from "@/server/llm/providers/gemini";
import { GroqProvider } from "@/server/llm/providers/groq";
import { HuggingFaceProvider } from "@/server/llm/providers/huggingface";
import { OpenRouterProvider } from "@/server/llm/providers/openrouter";
import type { LLMProvider, ModelInfo } from "@/server/llm/types";

export type ModelUnavailableReason = "UNKNOWN_PROVIDER" | "NOT_CONFIGURED" | "UNKNOWN_MODEL";

export class ModelUnavailableError extends Error {
  constructor(
    readonly ref: string,
    readonly reason: ModelUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

export interface AvailableModelInfo extends ModelInfo {
  /** The provider has credentials configured, so the model can be called. */
  available: boolean;
}

export interface ProviderSummary {
  id: string;
  name: string;
  isDemo: boolean;
  configured: boolean;
}

/**
 * Holds every provider adapter and answers "which models exist / which can be called".
 * Providers are injected, so tests can build a registry from fakes.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, LLMProvider>();

  constructor(providers: LLMProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new Error(`Duplicate provider id "${provider.id}"`);
      }
      this.providers.set(provider.id, provider);
    }
  }

  list(): LLMProvider[] {
    return [...this.providers.values()];
  }

  get(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId);
  }

  summaries(): ProviderSummary[] {
    return this.list().map((provider) => ({
      id: provider.id,
      name: provider.displayName,
      isDemo: provider.isDemo,
      configured: provider.isConfigured(),
    }));
  }

  async listModels({ includeUnavailable = false } = {}): Promise<AvailableModelInfo[]> {
    const perProvider = await Promise.all(
      this.list().map(async (provider) => {
        const available = provider.isConfigured();
        if (!available && !includeUnavailable) return [];
        try {
          const models = await provider.listModels();
          return models.map((model) => ({ ...model, available }));
        } catch {
          // A provider whose model listing fails must not hide every other provider's models.
          return [];
        }
      }),
    );
    return perProvider.flat();
  }

  /**
   * Resolves a model reference to a callable provider. Only models the provider lists are
   * allowed — this prevents arbitrary (possibly paid) models being requested with our keys.
   */
  async resolve(ref: string): Promise<{ provider: LLMProvider; model: ModelInfo }> {
    const { providerId, modelId } = parseModelRef(ref);
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ModelUnavailableError(ref, "UNKNOWN_PROVIDER", `Unknown provider "${providerId}"`);
    }
    if (!provider.isConfigured()) {
      throw new ModelUnavailableError(
        ref,
        "NOT_CONFIGURED",
        `${provider.displayName} is not configured (missing API key)`,
      );
    }
    const model = (await provider.listModels()).find((candidate) => candidate.modelId === modelId);
    if (!model) {
      throw new ModelUnavailableError(
        ref,
        "UNKNOWN_MODEL",
        `Model "${modelId}" is not enabled for ${provider.displayName}`,
      );
    }
    return { provider, model };
  }
}

/**
 * Builds the registry from the environment. Adding a provider = write its adapter and add one
 * line here (plus its API key in env.ts and a catalog entry).
 */
export function createProviderRegistry(
  env: Env = getEnv(),
  fetchImpl?: typeof fetch,
): ProviderRegistry {
  return new ProviderRegistry([
    new GroqProvider({
      apiKey: env.GROQ_API_KEY,
      models: resolveCatalogModels("groq", env.GROQ_MODELS),
      fetch: fetchImpl,
    }),
    new GeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      models: resolveCatalogModels("gemini", env.GEMINI_MODELS),
      fetch: fetchImpl,
    }),
    new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      defaultModels: resolveCatalogModels("openrouter"),
      overrideIds: env.OPENROUTER_MODELS,
      freeOnly: env.OPENROUTER_FREE_ONLY,
      appUrl: env.APP_URL,
      fetch: fetchImpl,
    }),
    new HuggingFaceProvider({
      apiKey: env.HUGGINGFACE_API_KEY,
      models: resolveCatalogModels("huggingface", env.HUGGINGFACE_MODELS),
      fetch: fetchImpl,
    }),
    new DemoProvider({ enabled: env.ENABLE_DEMO_PROVIDER, models: resolveCatalogModels("demo") }),
  ]);
}

let registry: ProviderRegistry | undefined;

export function getProviderRegistry(): ProviderRegistry {
  registry ??= createProviderRegistry();
  return registry;
}
