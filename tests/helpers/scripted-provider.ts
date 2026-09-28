import { LLMError } from "@/server/llm/errors";
import { sleep } from "@/server/llm/resilience";
import type { GenerateRequest, GenerateResult, LLMProvider, ModelInfo } from "@/server/llm/types";

type Handler = (request: GenerateRequest, call: number) => Promise<GenerateResult>;

/**
 * A provider whose models are scripted per test. Tracks concurrency so tests can prove calls
 * really run in parallel.
 */
export function createScriptedProvider(
  id: string,
  handlers: Record<string, Handler>,
  { configured = true }: { configured?: boolean } = {},
) {
  const stats = { inFlight: 0, maxInFlight: 0, callsByModel: new Map<string, number>() };

  const provider: LLMProvider = {
    id,
    displayName: `Scripted ${id}`,
    isDemo: false,
    isConfigured: () => configured,
    listModels: async (): Promise<ModelInfo[]> =>
      Object.keys(handlers).map((modelId) => ({
        ref: `${id}:${modelId}`,
        providerId: id,
        providerName: `Scripted ${id}`,
        modelId,
        displayName: modelId,
        capabilities: ["general"],
        isDemo: false,
      })),
    generate: async (request) => {
      const call = (stats.callsByModel.get(request.model) ?? 0) + 1;
      stats.callsByModel.set(request.model, call);
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      try {
        const handler = handlers[request.model];
        if (!handler) throw new LLMError("MODEL_NOT_FOUND", request.model, { providerId: id });
        return await handler(request, call);
      } finally {
        stats.inFlight -= 1;
      }
    },
  };
  return { provider, stats };
}

/** Handler: answer after `ms`, honouring the abort signal (so timeouts work). */
export const answerAfter =
  (
    ms: number,
    content = "A fine answer.",
    usage = { inputTokens: 100, outputTokens: 200 },
  ): Handler =>
  async (request) => {
    await sleep(ms, request.signal);
    return {
      content,
      finishReason: "stop",
      usage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
    };
  };

/** Handler: never answers; only the caller's timeout ends it. */
export const hang: Handler = async (request) => {
  await sleep(60_000, request.signal);
  throw new Error("unreachable");
};

/** Handler: always fails with the given error. */
export const failWith =
  (error: () => LLMError): Handler =>
  async () => {
    throw error();
  };
