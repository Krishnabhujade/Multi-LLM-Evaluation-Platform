import { describe, expect, it } from "vitest";
import {
  HF_ROUTER_BASE_URL,
  HuggingFaceProvider,
  pickOffer,
  type RouterOffer,
} from "@/server/llm/providers/huggingface";
import { chatCompletion, createFakeFetch, jsonResponse } from "../../helpers/fake-fetch";

const served = new Map<string, RouterOffer[]>([
  [
    "deepseek-ai/DeepSeek-V4-Flash",
    [
      {
        provider: "novita",
        live: true,
        pricing: { inputPerMTok: 0.14, outputPerMTok: 0.28 },
        throughput: 40,
        contextWindow: 1_048_576,
      },
      {
        provider: "deepinfra",
        live: true,
        pricing: { inputPerMTok: 0.09, outputPerMTok: 0.18 },
        throughput: 25,
        contextWindow: 1_048_576,
      },
      {
        provider: "cheap-but-down",
        live: false,
        pricing: { inputPerMTok: 0.01, outputPerMTok: 0.01 },
      },
    ],
  ],
]);

describe("pickOffer", () => {
  it("mirrors the router's :cheapest, :fastest and explicit-provider policies", () => {
    expect(pickOffer("deepseek-ai/DeepSeek-V4-Flash:cheapest", served)?.provider).toBe("deepinfra");
    expect(pickOffer("deepseek-ai/DeepSeek-V4-Flash:fastest", served)?.provider).toBe("novita");
    expect(pickOffer("deepseek-ai/DeepSeek-V4-Flash", served)?.provider).toBe("novita");
    expect(pickOffer("deepseek-ai/DeepSeek-V4-Flash:novita", served)?.provider).toBe("novita");
    expect(pickOffer("deepseek-ai/DeepSeek-V4-Flash:cheap-but-down", served)).toBeUndefined();
    expect(pickOffer("unknown/model:cheapest", served)).toBeUndefined();
  });
});

describe("HuggingFaceProvider", () => {
  const routerModels = {
    data: [
      {
        id: "deepseek-ai/DeepSeek-V4-Flash",
        providers: [
          {
            provider: "novita",
            status: "live",
            context_length: 1048576,
            pricing: { input: 0.14, output: 0.28 },
            throughput: 40,
          },
          {
            provider: "deepinfra",
            status: "live",
            context_length: 1048576,
            pricing: { input: 0.09, output: 0.18 },
            throughput: 25,
          },
        ],
      },
    ],
  };

  function hfWith() {
    const fake = createFakeFetch((request) =>
      request.url.endsWith("/models")
        ? jsonResponse(routerModels)
        : jsonResponse(chatCompletion("ok")),
    );
    const provider = new HuggingFaceProvider({
      apiKey: "hf_testtoken123456",
      models: [
        {
          modelId: "deepseek-ai/DeepSeek-V4-Flash:cheapest",
          displayName: "DeepSeek V4 Flash (HF)",
          capabilities: ["general"],
        },
      ],
      fetch: fake.fetch,
    });
    return { provider, calls: fake.calls };
  }

  it("fills pricing and context window from the router for the selected provider", async () => {
    const [model] = await hfWith().provider.listModels();
    expect(model).toMatchObject({
      ref: "huggingface:deepseek-ai/DeepSeek-V4-Flash:cheapest",
      pricing: { inputPerMTok: 0.09, outputPerMTok: 0.18 },
      contextWindow: 1_048_576,
    });
  });

  it("calls the router's OpenAI-compatible endpoint without JSON mode", async () => {
    const { provider, calls } = hfWith();
    await provider.generate({
      model: "deepseek-ai/DeepSeek-V4-Flash:cheapest",
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "json",
    });
    const completion = calls.find((call) => call.url === `${HF_ROUTER_BASE_URL}/chat/completions`)!;
    expect(completion.headers.get("authorization")).toBe("Bearer hf_testtoken123456");
    expect(completion.body).not.toHaveProperty("response_format");
  });
});
