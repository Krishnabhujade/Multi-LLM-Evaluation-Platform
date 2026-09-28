import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";
import {
  ModelUnavailableError,
  ProviderRegistry,
  createProviderRegistry,
} from "@/server/llm/registry";
import type { LLMProvider } from "@/server/llm/types";

const envWith = (vars: Record<string, string>) => parseEnv({ NODE_ENV: "development", ...vars });

describe("createProviderRegistry", () => {
  it("offers only providers with credentials (plus demo in development)", async () => {
    const registry = createProviderRegistry(envWith({}));
    const summaries = registry.summaries();

    expect(summaries.find((provider) => provider.id === "groq")?.configured).toBe(false);
    expect(summaries.find((provider) => provider.id === "demo")?.configured).toBe(true);

    const available = await registry.listModels();
    expect(available.every((model) => model.providerId === "demo" && model.available)).toBe(true);

    const all = await registry.listModels({ includeUnavailable: true });
    expect(all.some((model) => model.providerId === "groq" && !model.available)).toBe(true);
  });

  it("applies env model overrides", async () => {
    const registry = createProviderRegistry(
      envWith({ GROQ_API_KEY: "gsk_x", GROQ_MODELS: "llama-3.1-8b-instant,brand-new-model" }),
    );
    const groqModels = (await registry.listModels()).filter((model) => model.providerId === "groq");

    expect(groqModels.map((model) => model.modelId)).toEqual([
      "llama-3.1-8b-instant",
      "brand-new-model",
    ]);
    // Known ids keep catalog metadata; unknown ids get generic metadata.
    expect(groqModels[0]!.displayName).toBe("Llama 3.1 8B Instant");
    expect(groqModels[1]).toMatchObject({
      displayName: "brand-new-model",
      capabilities: ["general"],
    });
  });

  it("disables the demo provider in production unless opted in", () => {
    const production = createProviderRegistry(parseEnv({ NODE_ENV: "production" }));
    expect(production.get("demo")?.isConfigured()).toBe(false);

    const optedIn = createProviderRegistry(
      parseEnv({ NODE_ENV: "production", ENABLE_DEMO_PROVIDER: "true" }),
    );
    expect(optedIn.get("demo")?.isConfigured()).toBe(true);
  });
});

describe("ProviderRegistry.resolve", () => {
  const registry = createProviderRegistry(envWith({}));

  it("resolves an available model", async () => {
    const { provider, model } = await registry.resolve("demo:demo-concise");
    expect(provider.id).toBe("demo");
    expect(model.modelId).toBe("demo-concise");
  });

  it.each([
    ["nope:model", "UNKNOWN_PROVIDER"],
    ["groq:llama-3.3-70b-versatile", "NOT_CONFIGURED"],
    ["demo:not-listed", "UNKNOWN_MODEL"],
  ])("rejects %s with %s", async (ref, reason) => {
    const error = await registry.resolve(ref).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelUnavailableError);
    expect(error).toMatchObject({ reason, ref });
  });

  it("rejects duplicate provider ids", () => {
    const fake = { id: "dup" } as LLMProvider;
    expect(() => new ProviderRegistry([fake, fake])).toThrow(/Duplicate provider/);
  });

  it("keeps listing other providers when one provider's listing fails", async () => {
    const broken: LLMProvider = {
      id: "broken",
      displayName: "Broken",
      isDemo: false,
      isConfigured: () => true,
      listModels: () => Promise.reject(new Error("discovery down")),
      generate: () => Promise.reject(new Error("unused")),
    };
    const mixed = new ProviderRegistry([broken, ...registry.list()]);
    const models = await mixed.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.providerId !== "broken")).toBe(true);
  });
});
