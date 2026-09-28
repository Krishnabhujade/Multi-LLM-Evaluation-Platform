import { formatModelRef } from "@/lib/model-ref";
import type { CatalogModel } from "@/server/llm/catalog";
import { LLMError, toLLMError } from "@/server/llm/errors";
import {
  balancedAnswer,
  conciseAnswer,
  lastUserMessage,
  syntheticJudgement,
  verboseAnswer,
} from "@/server/llm/providers/demo-content";
import { sleep } from "@/server/llm/resilience";
import { estimateTokens } from "@/server/llm/text";
import type { GenerateRequest, GenerateResult, LLMProvider, ModelInfo } from "@/server/llm/types";

export interface DemoProviderOptions {
  enabled: boolean;
  models: CatalogModel[];
  /** Multiplier for simulated latency; tests pass 0 for instant responses. */
  latencyScale?: number;
}

/**
 * Deterministic fake models (development data) so the whole pipeline — including failure
 * handling — can be exercised with zero API keys:
 *   demo-concise / demo-verbose  succeed with contrasting answer styles
 *   demo-flaky                   returns 429 on every other call (exercises retry + backoff)
 *   demo-slow                    never answers (exercises the per-call timeout)
 *   demo-judge                   returns synthetic judge JSON
 */
export class DemoProvider implements LLMProvider {
  readonly id = "demo";
  readonly displayName = "Demo (development data)";
  readonly isDemo = true;
  private readonly flakyCalls = new Map<string, number>();

  constructor(private readonly options: DemoProviderOptions) {}

  isConfigured(): boolean {
    return this.options.enabled;
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
      isDemo: true,
    }));
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const prompt = lastUserMessage(request.messages);
    switch (request.model) {
      case "demo-concise":
        await this.delay(450, request.signal);
        return this.result(request, conciseAnswer(prompt));
      case "demo-verbose":
        await this.delay(1_200, request.signal);
        return this.result(request, verboseAnswer(prompt));
      case "demo-flaky": {
        await this.delay(250, request.signal);
        if (this.nextFlakyCallFails(prompt)) {
          throw new LLMError("RATE_LIMITED", "Demo rate limit — retry shortly", {
            providerId: this.id,
            status: 429,
            retryAfterMs: Math.round(300 * this.scale),
          });
        }
        return this.result(request, balancedAnswer(prompt));
      }
      case "demo-slow":
        // Never answers in time; the caller's timeout signal aborts the wait.
        await this.delay(10 * 60_000, request.signal, { unscaled: true });
        throw new LLMError("TIMEOUT", "Demo slow model did not respond", { providerId: this.id });
      case "demo-judge":
        await this.delay(300, request.signal);
        return this.result(request, syntheticJudgement(request.messages));
      default:
        throw new LLMError("MODEL_NOT_FOUND", `Unknown demo model "${request.model}"`, {
          providerId: this.id,
          status: 404,
        });
    }
  }

  private get scale() {
    return this.options.latencyScale ?? 1;
  }

  private async delay(ms: number, signal?: AbortSignal, { unscaled = false } = {}) {
    try {
      await sleep(unscaled ? ms : ms * this.scale, signal);
    } catch (error) {
      throw toLLMError(error, this.id);
    }
  }

  /** Odd-numbered calls for a given prompt fail, so the first retry succeeds. */
  private nextFlakyCallFails(prompt: string): boolean {
    if (this.flakyCalls.size > 1_000) this.flakyCalls.clear();
    const calls = (this.flakyCalls.get(prompt) ?? 0) + 1;
    this.flakyCalls.set(prompt, calls);
    return calls % 2 === 1;
  }

  private result(request: GenerateRequest, content: string): GenerateResult {
    const inputTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));
    const outputTokens = estimateTokens(content);
    return {
      content,
      finishReason: "stop",
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      resolvedModel: request.model,
    };
  }
}
