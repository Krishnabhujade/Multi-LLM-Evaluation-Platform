import type { Capability } from "@/lib/capabilities";
import type { ModelPricing } from "@/server/llm/catalog";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateRequest {
  /** The provider's own model id (no provider prefix). */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Request a JSON object where the provider supports it (used by the judge). */
  responseFormat?: "text" | "json";
  /** Cancels the in-flight request (timeouts, client disconnects). */
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface GenerateResult {
  content: string;
  finishReason?: string;
  usage?: TokenUsage;
  /** The concrete model that served the request, when the provider reports it (routers). */
  resolvedModel?: string;
}

export interface ModelInfo {
  /** `"<providerId>:<modelId>"` — see `@/lib/model-ref`. */
  ref: string;
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  capabilities: Capability[];
  contextWindow?: number;
  pricing?: ModelPricing;
  isDemo: boolean;
}

/**
 * The contract every provider adapter implements. Adapters translate between this interface and
 * a provider's wire format and normalize failures into `LLMError`; retry and timeout policy
 * live outside the adapters (see `invoke.ts`) so every provider gets identical behaviour.
 */
export interface LLMProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isDemo: boolean;
  /** Whether credentials are present. Never exposes the credential itself. */
  isConfigured(): boolean;
  listModels(): Promise<ModelInfo[]>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
