import { describe, expect, it } from "vitest";
import { GEMINI_BASE_URL, GeminiProvider, buildGeminiBody } from "@/server/llm/providers/gemini";
import type { GenerateRequest } from "@/server/llm/types";
import { createFakeFetch, jsonResponse } from "../../helpers/fake-fetch";

const MODELS = [
  {
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    capabilities: ["general" as const],
  },
];
const KEY = "AIzaSyTESTKEY1234567890abcdefghij";

const request: GenerateRequest = {
  model: "gemini-3.8-flash",
  messages: [
    { role: "system", content: "You are terse." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi." },
    { role: "user", content: "Explain DNS" },
  ],
  temperature: 0.4,
  maxTokens: 256,
};

const success = (text: string, overrides: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: {
    promptTokenCount: 20,
    candidatesTokenCount: 30,
    thoughtsTokenCount: 10,
    totalTokenCount: 60,
  },
  modelVersion: "gemini-3.8-flash-001",
  ...overrides,
});

function geminiWith(responder: Parameters<typeof createFakeFetch>[0]) {
  const fake = createFakeFetch(responder);
  return {
    provider: new GeminiProvider({ apiKey: KEY, models: MODELS, fetch: fake.fetch }),
    calls: fake.calls,
  };
}

describe("GeminiProvider (native API)", () => {
  it("maps chat messages to generateContent with the key in a header, not the URL", async () => {
    const { provider, calls } = geminiWith(() => jsonResponse(success("DNS maps names to IPs.")));
    await provider.generate(request);

    const [call] = calls;
    expect(call!.url).toBe(`${GEMINI_BASE_URL}/models/gemini-3.8-flash:generateContent`);
    expect(call!.url).not.toContain(KEY);
    expect(call!.headers.get("x-goog-api-key")).toBe(KEY);
    expect(call!.body).toEqual({
      systemInstruction: { parts: [{ text: "You are terse." }] },
      contents: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi." }] },
        { role: "user", parts: [{ text: "Explain DNS" }] },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
    });
  });

  it("requests JSON output via responseMimeType", () => {
    const body = buildGeminiBody({ ...request, responseFormat: "json" });
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json" });
  });

  it("parses text, usage (thinking counted as output) and model version", async () => {
    const { provider } = geminiWith(() => jsonResponse(success("  Answer  ")));
    await expect(provider.generate(request)).resolves.toEqual({
      content: "Answer",
      finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60 },
      resolvedModel: "gemini-3.8-flash-001",
    });
  });

  it("excludes thought parts from the answer", async () => {
    const { provider } = geminiWith(() =>
      jsonResponse(
        success("", {
          candidates: [
            {
              content: { parts: [{ text: "Let me think…", thought: true }, { text: "Final." }] },
              finishReason: "STOP",
            },
          ],
        }),
      ),
    );
    await expect(provider.generate(request)).resolves.toMatchObject({ content: "Final." });
  });

  it("explains an empty answer caused by MAX_TOKENS", async () => {
    const { provider } = geminiWith(() =>
      jsonResponse(
        success("", { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }),
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
      message: expect.stringContaining("MAX_TOKENS"),
    });
  });

  it("maps safety blocks on the prompt and on the response", async () => {
    const blockedPrompt = geminiWith(() =>
      jsonResponse({ promptFeedback: { blockReason: "SAFETY" } }),
    );
    await expect(blockedPrompt.provider.generate(request)).rejects.toMatchObject({
      code: "CONTENT_FILTERED",
    });

    const blockedAnswer = geminiWith(() =>
      jsonResponse(success("", { candidates: [{ finishReason: "SAFETY" }] })),
    );
    await expect(blockedAnswer.provider.generate(request)).rejects.toMatchObject({
      code: "CONTENT_FILTERED",
    });
  });

  it("treats Gemini's 400 API_KEY_INVALID as an auth error", async () => {
    const { provider } = geminiWith(() =>
      jsonResponse(
        {
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            status: "INVALID_ARGUMENT",
            details: [
              { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
            ],
          },
        },
        400,
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "AUTH",
      retryable: false,
    });
  });

  it("reads the retry delay from RetryInfo on 429", async () => {
    const { provider } = geminiWith(() =>
      jsonResponse(
        {
          error: {
            code: 429,
            message: "Resource has been exhausted",
            status: "RESOURCE_EXHAUSTED",
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7s" }],
          },
        },
        429,
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 7000,
    });
  });

  it("maps 503 overload to a retryable unavailable error", async () => {
    const { provider } = geminiWith(() =>
      jsonResponse(
        { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } },
        503,
      ),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "UNAVAILABLE",
      retryable: true,
    });
  });
});
