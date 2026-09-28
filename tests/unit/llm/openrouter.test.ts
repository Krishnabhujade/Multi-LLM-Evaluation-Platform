import { describe, expect, it } from "vitest";
import { resolveCatalogModels } from "@/server/llm/catalog";
import {
  OPENROUTER_BASE_URL,
  OpenRouterProvider,
  type OpenRouterOptions,
} from "@/server/llm/providers/openrouter";
import { chatCompletion, createFakeFetch, jsonResponse } from "../../helpers/fake-fetch";

const liveCatalog = {
  data: [
    {
      id: "qwen/qwen3.8-27b:free",
      name: "Qwen: Qwen3.8 27B (free)",
      context_length: 262144,
      pricing: { prompt: "0", completion: "0" },
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "acme/new-coder:free",
      name: "Acme: New Coder (free)",
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "acme/paid-model",
      name: "Acme: Paid",
      context_length: 128000,
      pricing: { prompt: "0.0000015", completion: "0.000006" },
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "acme/image-gen:free",
      name: "Acme: Images (free)",
      pricing: { prompt: "0", completion: "0" },
      architecture: { output_modalities: ["image"] },
    },
    {
      id: "openrouter/free",
      name: "Free Models Router",
      pricing: { prompt: "0", completion: "0" },
    },
  ],
};

function openRouterWith(options: Partial<OpenRouterOptions> = {}, catalogStatus = 200) {
  const fake = createFakeFetch((request) =>
    request.url.endsWith("/models")
      ? jsonResponse(catalogStatus === 200 ? liveCatalog : { error: "down" }, catalogStatus)
      : jsonResponse(chatCompletion("ok")),
  );
  const provider = new OpenRouterProvider({
    apiKey: "sk-or-v1-test",
    defaultModels: resolveCatalogModels("openrouter"),
    overrideIds: [],
    freeOnly: true,
    appUrl: "https://eval.example.com",
    fetch: fake.fetch,
    ...options,
  });
  return { provider, calls: fake.calls };
}

describe("OpenRouterProvider", () => {
  it("discovers free text models only, curated entries first", async () => {
    const { provider } = openRouterWith();
    const models = await provider.listModels();

    expect(models.map((model) => model.modelId)).toEqual([
      "qwen/qwen3.8-27b:free",
      "acme/new-coder:free",
    ]);
    // Curated name/capabilities win for known ids; live pricing/context are used.
    expect(models[0]).toMatchObject({
      displayName: "Qwen3.8 27B (free)",
      contextWindow: 262144,
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    });
    // Unknown ids get inferred capability tags.
    expect(models[1]!.capabilities).toContain("coding");
  });

  it("caches discovery between listings", async () => {
    const { provider, calls } = openRouterWith();
    await provider.listModels();
    await provider.listModels();
    expect(calls.filter((call) => call.url.endsWith("/models"))).toHaveLength(1);
  });

  it("falls back to the curated catalog when discovery fails", async () => {
    const { provider } = openRouterWith({}, 503);
    const models = await provider.listModels();
    expect(models.map((model) => model.modelId)).toEqual(
      resolveCatalogModels("openrouter").map((model) => model.modelId),
    );
  });

  it("honours OPENROUTER_MODELS and drops paid models when free-only", async () => {
    const override = ["acme/paid-model", "acme/new-coder:free"];
    const freeOnly = await openRouterWith({ overrideIds: override }).provider.listModels();
    expect(freeOnly.map((model) => model.modelId)).toEqual(["acme/new-coder:free"]);

    const paidAllowed = await openRouterWith({
      overrideIds: override,
      freeOnly: false,
    }).provider.listModels();
    expect(paidAllowed.map((model) => model.modelId)).toEqual(override);
    expect(paidAllowed[0]!.pricing).toEqual({ inputPerMTok: 1.5, outputPerMTok: 6 });
  });

  it("sends attribution headers with completions", async () => {
    const { provider, calls } = openRouterWith();
    await provider.generate({
      model: "qwen/qwen3.8-27b:free",
      messages: [{ role: "user", content: "hi" }],
    });

    const completion = calls.find(
      (call) => call.url === `${OPENROUTER_BASE_URL}/chat/completions`,
    )!;
    expect(completion.headers.get("authorization")).toBe("Bearer sk-or-v1-test");
    expect(completion.headers.get("http-referer")).toBe("https://eval.example.com");
    expect(completion.headers.get("x-openrouter-title")).toBe("Multi-LLM Evaluation Platform");
  });

  it("skips discovery entirely without an API key", async () => {
    const { provider, calls } = openRouterWith({ apiKey: undefined });
    const models = await provider.listModels();
    expect(calls).toHaveLength(0);
    expect(models.length).toBe(resolveCatalogModels("openrouter").length);
  });
});
