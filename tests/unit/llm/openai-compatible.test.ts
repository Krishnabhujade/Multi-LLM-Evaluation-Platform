import { describe, expect, it } from "vitest";
import { GROQ_BASE_URL, GroqProvider } from "@/server/llm/providers/groq";
import type { GenerateRequest } from "@/server/llm/types";
import { chatCompletion, createFakeFetch, jsonResponse } from "../../helpers/fake-fetch";

const MODELS = [
  {
    modelId: "llama-3.3-70b-versatile",
    displayName: "Llama 3.3 70B",
    capabilities: ["general" as const],
  },
];

const request: GenerateRequest = {
  model: "llama-3.3-70b-versatile",
  messages: [
    { role: "system", content: "Be brief." },
    { role: "user", content: "Hi" },
  ],
  temperature: 0.3,
  maxTokens: 128,
};

function groqWith(
  responder: Parameters<typeof createFakeFetch>[0],
  { withoutKey = false }: { withoutKey?: boolean } = {},
) {
  const fake = createFakeFetch(responder);
  const apiKey = withoutKey ? undefined : "gsk_test_key_123456";
  return {
    provider: new GroqProvider({ apiKey, models: MODELS, fetch: fake.fetch }),
    calls: fake.calls,
  };
}

describe("OpenAI-compatible adapter (Groq)", () => {
  it("sends a chat completion request with auth and parameters", async () => {
    const { provider, calls } = groqWith(() => jsonResponse(chatCompletion("Hello!")));
    await provider.generate(request);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(`${GROQ_BASE_URL}/chat/completions`);
    expect(call!.method).toBe("POST");
    expect(call!.headers.get("authorization")).toBe("Bearer gsk_test_key_123456");
    expect(call!.body).toEqual({
      model: "llama-3.3-70b-versatile",
      messages: request.messages,
      temperature: 0.3,
      max_tokens: 128,
      stream: false,
    });
  });

  it("requests JSON mode when asked", async () => {
    const { provider, calls } = groqWith(() => jsonResponse(chatCompletion("{}")));
    await provider.generate({ ...request, responseFormat: "json" });
    expect(calls[0]!.body).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("maps content, finish reason, usage and the served model", async () => {
    const { provider } = groqWith(() => jsonResponse(chatCompletion("  Hello!  ")));
    await expect(provider.generate(request)).resolves.toEqual({
      content: "Hello!",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
      resolvedModel: "served-model",
    });
  });

  it("strips inline <think> reasoning and joins content parts", async () => {
    const { provider } = groqWith(() =>
      jsonResponse(
        chatCompletion(null, {
          choices: [
            {
              message: {
                content: [
                  { type: "text", text: "<think>hmm</think>Final " },
                  { type: "text", text: "answer" },
                ],
              },
              finish_reason: "stop",
            },
          ],
        }),
      ),
    );
    await expect(provider.generate(request)).resolves.toMatchObject({ content: "Final answer" });
  });

  it("computes total tokens when the provider omits it", async () => {
    const { provider } = groqWith(() =>
      jsonResponse(chatCompletion("ok", { usage: { prompt_tokens: 5, completion_tokens: 7 } })),
    );
    await expect(provider.generate(request)).resolves.toMatchObject({
      usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
    });
  });

  it("reports an empty answer caused by the token limit clearly", async () => {
    const { provider } = groqWith(() =>
      jsonResponse(
        chatCompletion(null, {
          choices: [{ message: { content: "<think>still thinking" }, finish_reason: "length" }],
        }),
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
      message: expect.stringContaining("finish_reason: length"),
    });
  });

  it("maps content filtering", async () => {
    const { provider } = groqWith(() =>
      jsonResponse(
        chatCompletion("", {
          choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
        }),
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "CONTENT_FILTERED" });
  });

  it("maps HTTP 429 with retry-after to a retryable rate-limit error", async () => {
    const { provider } = groqWith(() =>
      jsonResponse({ error: { message: "Rate limit reached for model" } }, 429, {
        "retry-after": "3",
      }),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterMs: 3000,
      providerId: "groq",
    });
  });

  it("maps HTTP 401 to an authentication error", async () => {
    const { provider } = groqWith(() =>
      jsonResponse({ error: { message: "Invalid API Key" } }, 401),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "AUTH",
      retryable: false,
    });
  });

  it("maps network failures", async () => {
    const { provider } = groqWith(() => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
    });
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "NETWORK",
      retryable: true,
    });
  });

  it("maps aborts from a timeout signal", async () => {
    const { provider } = groqWith(() => jsonResponse(chatCompletion("late")));
    const signal = AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
    await expect(provider.generate({ ...request, signal })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("rejects non-JSON and malformed success bodies", async () => {
    const html = groqWith(() => new Response("<html>oops</html>", { status: 200 }));
    await expect(html.provider.generate(request)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    const malformed = groqWith(() => jsonResponse({ choices: [] }));
    await expect(malformed.provider.generate(request)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("maps errors embedded in a 200 response (gateway style)", async () => {
    const { provider } = groqWith(() =>
      jsonResponse({ error: { code: 429, message: "Upstream rate limited" } }),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("refuses to call the API without a key and reports itself unconfigured", async () => {
    const { provider, calls } = groqWith(() => jsonResponse(chatCompletion("x")), {
      withoutKey: true,
    });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "AUTH" });
    expect(calls).toHaveLength(0);
  });

  it("lists its models with provider-qualified refs", async () => {
    const { provider } = groqWith(() => jsonResponse({}));
    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({
        ref: "groq:llama-3.3-70b-versatile",
        providerId: "groq",
        providerName: "Groq",
        isDemo: false,
      }),
    ]);
  });
});
