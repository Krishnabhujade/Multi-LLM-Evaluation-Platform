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

export interface OpenAICompatibleOptions {
  id: string;
  displayName: string;
  /** Base URL up to and including the version segment, e.g. `https://api.groq.com/openai/v1`. */
  baseUrl: string;
  apiKey: string | undefined;
  models: CatalogModel[];
  extraHeaders?: Record<string, string>;
  /** Whether the API accepts `response_format: { type: "json_object" }`. */
  supportsJsonMode?: boolean;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

const ContentPartSchema = z.object({ type: z.string(), text: z.string().optional() });

/** Lenient: only the fields we use are validated; providers add many extras. */
const ChatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z
        .object({ content: z.union([z.string(), z.array(ContentPartSchema)]).nullish() })
        .nullish(),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      total_tokens: z.number().nullish(),
    })
    .nullish(),
});

const EmbeddedErrorSchema = z.object({
  error: z.object({ code: z.union([z.number(), z.string()]).optional(), message: z.string() }),
});

/**
 * Adapter for the de-facto standard OpenAI Chat Completions wire format, which Groq, OpenRouter
 * and the Hugging Face router all implement. Subclasses supply endpoint, headers and model lists
 * and override hooks only where a provider deviates.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isDemo = false;
  protected readonly fetchImpl: typeof fetch;

  constructor(protected readonly options: OpenAICompatibleOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.options.models.map((model) => this.toModelInfo(model));
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const json = await this.postJson(
      "/chat/completions",
      this.buildRequestBody(request),
      request.signal,
    );
    return this.parseCompletion(json);
  }

  protected toModelInfo(model: CatalogModel): ModelInfo {
    return {
      ref: formatModelRef({ providerId: this.id, modelId: model.modelId }),
      providerId: this.id,
      providerName: this.displayName,
      modelId: model.modelId,
      displayName: model.displayName,
      capabilities: model.capabilities,
      contextWindow: model.contextWindow,
      pricing: model.pricing,
      isDemo: false,
    };
  }

  protected buildHeaders(): Record<string, string> {
    return {
      ...(this.options.apiKey && { Authorization: `Bearer ${this.options.apiKey}` }),
      "Content-Type": "application/json",
      ...this.options.extraHeaders,
    };
  }

  protected buildRequestBody(request: GenerateRequest): Record<string, unknown> {
    const wantsJson = request.responseFormat === "json" && this.options.supportsJsonMode !== false;
    return {
      model: request.model,
      messages: request.messages,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.maxTokens !== undefined && { max_tokens: request.maxTokens }),
      ...(wantsJson && { response_format: { type: "json_object" } }),
      stream: false,
    };
  }

  protected async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!this.options.apiKey) {
      throw new LLMError("AUTH", `${this.displayName} API key is not configured`, {
        providerId: this.id,
      });
    }

    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });
      text = await response.text();
    } catch (error) {
      throw toLLMError(error, this.id);
    }

    if (!response.ok) throw errorFromHttpResponse(this.id, response.status, text, response.headers);

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LLMError("INVALID_RESPONSE", `${this.displayName} returned a non-JSON response`, {
        providerId: this.id,
        status: response.status,
      });
    }
  }

  protected parseCompletion(json: unknown): GenerateResult {
    // Gateways such as OpenRouter can report upstream failures inside a 200 response.
    const embedded = EmbeddedErrorSchema.safeParse(json);
    if (embedded.success) {
      const { code, message } = embedded.data.error;
      const status = typeof code === "number" ? code : 502;
      throw errorFromHttpResponse(
        this.id,
        status,
        JSON.stringify({ error: { message } }),
        new Headers(),
      );
    }

    const parsed = ChatCompletionSchema.safeParse(json);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!parsed.success || !choice) {
      throw new LLMError("INVALID_RESPONSE", `Unexpected response shape from ${this.displayName}`, {
        providerId: this.id,
      });
    }

    const raw = choice.message?.content;
    const text =
      typeof raw === "string" ? raw : (raw ?? []).map((part) => part.text ?? "").join("");
    const content = stripReasoning(text).trim();
    const finishReason = choice.finish_reason ?? undefined;

    if (finishReason === "content_filter") {
      throw new LLMError("CONTENT_FILTERED", "The provider's content filter blocked the response", {
        providerId: this.id,
      });
    }
    if (!content) {
      throw new LLMError(
        "EMPTY_RESPONSE",
        finishReason === "length"
          ? "The model used its whole token budget without producing an answer (finish_reason: length). Try a higher max tokens."
          : "The model returned an empty response",
        { providerId: this.id },
      );
    }

    return {
      content,
      finishReason,
      usage: mapUsage(parsed.data.usage),
      resolvedModel: parsed.data.model,
    };
  }
}

function mapUsage(usage: z.infer<typeof ChatCompletionSchema>["usage"]): TokenUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens ?? undefined;
  const outputTokens = usage.completion_tokens ?? undefined;
  const totalTokens =
    usage.total_tokens ??
    (inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined);
  return { inputTokens, outputTokens, totalTokens };
}
