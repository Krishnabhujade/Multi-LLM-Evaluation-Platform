import type { CatalogModel } from "@/server/llm/catalog";
import { LLMError } from "@/server/llm/errors";
import { OpenAICompatibleProvider } from "@/server/llm/providers/openai-compatible";
import type { GenerateRequest, GenerateResult } from "@/server/llm/types";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Below this an answer is too short to be worth sending; the original error is kept instead. */
const MIN_OUTPUT_TOKENS = 64;

/**
 * Reads Groq's "Request too large … Limit 1000, Requested 1024" rejection: a request whose
 * `max_tokens` alone exceeds a per-minute token limit can never succeed, however long we wait.
 */
export function oversizedRequest(
  error: unknown,
): { over: number; outputLimit: boolean } | undefined {
  if (!(error instanceof LLMError) || error.code !== "RATE_LIMITED") return undefined;
  const match = /request too large[\s\S]*?limit (\d+), requested (\d+)/i.exec(error.message);
  if (!match) return undefined;
  const over = Number(match[2]) - Number(match[1]);
  const outputLimit = /on output tokens per minute|\(OTPM\)/i.test(error.message);
  return over > 0 ? { over, outputLimit } : undefined;
}

/**
 * Groq — OpenAI-compatible, very low latency, generous free tier (≈30 RPM per model).
 * Rate limits come back as HTTP 429 with `retry-after`, handled by the shared error mapping.
 *
 * Some free-tier models also cap output tokens per minute (Qwen: 1,000) and reject any request
 * whose `max_tokens` exceeds the cap. Such a request is retried at once with a budget that fits,
 * and an output cap is remembered per model so later requests fit from the start.
 */
export class GroqProvider extends OpenAICompatibleProvider {
  private readonly outputCaps = new Map<string, number>();

  constructor(options: {
    apiKey: string | undefined;
    models: CatalogModel[];
    fetch?: typeof fetch;
  }) {
    super({
      id: "groq",
      displayName: "Groq",
      baseUrl: GROQ_BASE_URL,
      supportsJsonMode: true,
      ...options,
    });
  }

  override async generate(request: GenerateRequest): Promise<GenerateResult> {
    const cap = this.outputCaps.get(request.model);
    const sent =
      cap !== undefined && (request.maxTokens ?? Infinity) > cap
        ? { ...request, maxTokens: cap }
        : request;
    try {
      return await super.generate(sent);
    } catch (error) {
      const oversized = oversizedRequest(error);
      const fitted =
        oversized && sent.maxTokens !== undefined ? sent.maxTokens - oversized.over : undefined;
      if (fitted === undefined || fitted < MIN_OUTPUT_TOKENS) throw error;
      // Output caps are per model; total-token overages depend on this prompt, so only retry.
      if (oversized?.outputLimit) this.outputCaps.set(request.model, fitted);
      return super.generate({ ...sent, maxTokens: fitted });
    }
  }
}
