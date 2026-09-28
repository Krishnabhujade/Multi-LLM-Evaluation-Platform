import { z } from "zod";
import { formatModelRef } from "@/lib/model-ref";
import type { CatalogModel } from "@/server/llm/catalog";
import { LLMError, errorFromHttpResponse, toLLMError } from "@/server/llm/errors";
import { stripReasoning } from "@/server/llm/text";
import type {
  GenerateRequest,
  GenerateResult,
  LLMProvider,
  ModelInfo,
  TokenUsage,
} from "@/server/llm/types";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const GenerateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional(),
  modelVersion: z.string().optional(),
});

const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

/**
 * Google Gemini via its native `generateContent` REST API — deliberately not the OpenAI
 * compatibility layer, to show the provider contract is not tied to OpenAI's wire format.
 * The key travels in the `x-goog-api-key` header, never in the URL.
 */
export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  readonly displayName = "Google Gemini";
  readonly isDemo = false;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly options: {
      apiKey: string | undefined;
      models: CatalogModel[];
      fetch?: typeof fetch;
    },
  ) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.options.models.map((model) => ({
      ref: formatModelRef({ providerId: this.id, modelId: model.modelId }),
      providerId: this.id,
      providerName: this.displayName,
      modelId: model.modelId,
      displayName: model.displayName,
      capabilities: model.capabilities,
      contextWindow: model.contextWindow,
      pricing: model.pricing,
      isDemo: false,
    }));
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.options.apiKey) {
      throw new LLMError("AUTH", "Google Gemini API key is not configured", {
        providerId: this.id,
      });
    }

    const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(request.model)}:generateContent`;
    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "x-goog-api-key": this.options.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiBody(request)),
        signal: request.signal,
      });
      text = await response.text();
    } catch (error) {
      throw toLLMError(error, this.id);
    }

    if (!response.ok) throw geminiHttpError(response.status, text, response.headers);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LLMError("INVALID_RESPONSE", "Google Gemini returned a non-JSON response", {
        providerId: this.id,
      });
    }
    return this.parse(json);
  }

  private parse(json: unknown): GenerateResult {
    const parsed = GenerateContentResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new LLMError("INVALID_RESPONSE", "Unexpected response shape from Google Gemini", {
        providerId: this.id,
      });
    }
    const { candidates, promptFeedback, usageMetadata, modelVersion } = parsed.data;

    if (promptFeedback?.blockReason) {
      throw new LLMError(
        "CONTENT_FILTERED",
        `Prompt blocked by Gemini (${promptFeedback.blockReason})`,
        {
          providerId: this.id,
        },
      );
    }

    const candidate = candidates?.[0];
    const finishReason = candidate?.finishReason;
    // Thought-summary parts (when present) are reasoning, not the answer.
    const answer = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    const content = stripReasoning(answer).trim();

    if (!content) {
      if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
        throw new LLMError("CONTENT_FILTERED", `Response blocked by Gemini (${finishReason})`, {
          providerId: this.id,
        });
      }
      throw new LLMError(
        "EMPTY_RESPONSE",
        finishReason === "MAX_TOKENS"
          ? "Gemini used its whole token budget (including thinking) without an answer (finishReason: MAX_TOKENS). Try a higher max tokens."
          : "Google Gemini returned an empty response",
        { providerId: this.id },
      );
    }

    return {
      content,
      finishReason: finishReason?.toLowerCase(),
      usage: mapGeminiUsage(usageMetadata),
      resolvedModel: modelVersion,
    };
  }
}

export function buildGeminiBody(request: GenerateRequest) {
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    generationConfig: {
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.maxTokens !== undefined && { maxOutputTokens: request.maxTokens }),
      ...(request.responseFormat === "json" && { responseMimeType: "application/json" }),
    },
  };
}

/** Thinking tokens are billed as output, so they are counted in `outputTokens`. */
function mapGeminiUsage(
  usage: z.infer<typeof GenerateContentResponseSchema>["usageMetadata"],
): TokenUsage | undefined {
  if (!usage) return undefined;
  const outputTokens =
    usage.candidatesTokenCount === undefined && usage.thoughtsTokenCount === undefined
      ? undefined
      : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return {
    inputTokens: usage.promptTokenCount,
    outputTokens,
    totalTokens: usage.totalTokenCount,
  };
}

const GeminiErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    status: z.string().optional(),
    details: z
      .array(
        z.object({
          "@type": z.string().optional(),
          retryDelay: z.string().optional(),
          reason: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

/** Gemini deviations from plain HTTP semantics: invalid keys are 400s; retry hints live in the body. */
export function geminiHttpError(status: number, body: string, headers: Headers): LLMError {
  const base = errorFromHttpResponse("gemini", status, body, headers);
  let parsed: z.infer<typeof GeminiErrorSchema> | undefined;
  try {
    const result = GeminiErrorSchema.safeParse(JSON.parse(body));
    parsed = result.success ? result.data : undefined;
  } catch {
    parsed = undefined;
  }
  const details = parsed?.error.details ?? [];

  if (status === 400 && details.some((detail) => detail.reason === "API_KEY_INVALID")) {
    return new LLMError("AUTH", `Authentication failed: ${base.message}`, {
      status,
      providerId: "gemini",
    });
  }
  if (base.code === "RATE_LIMITED" && base.retryAfterMs === undefined) {
    const retryDelay = details.find((detail) => detail.retryDelay)?.retryDelay;
    const seconds = retryDelay ? Number.parseFloat(retryDelay) : Number.NaN;
    if (Number.isFinite(seconds)) {
      return new LLMError("RATE_LIMITED", base.message, {
        status,
        providerId: "gemini",
        retryAfterMs: Math.round(seconds * 1000),
      });
    }
  }
  return base;
}
