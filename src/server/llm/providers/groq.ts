import type { CatalogModel } from "@/server/llm/catalog";
import { OpenAICompatibleProvider } from "@/server/llm/providers/openai-compatible";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Groq — OpenAI-compatible, very low latency, generous free tier (≈30 RPM per model).
 * Rate limits come back as HTTP 429 with `retry-after`, handled by the shared error mapping.
 */
export class GroqProvider extends OpenAICompatibleProvider {
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
}
