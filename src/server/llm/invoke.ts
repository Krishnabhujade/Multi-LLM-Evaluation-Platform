import type { LLMError } from "@/server/llm/errors";
import { toLLMError } from "@/server/llm/errors";
import { timeoutSignal, withRetry, type RetryHooks } from "@/server/llm/resilience";
import type { GenerateRequest, GenerateResult, LLMProvider } from "@/server/llm/types";

export interface InvokePolicy {
  /** Per-attempt timeout. */
  timeoutMs: number;
  maxRetries: number;
  /** Epoch ms; no retry starts after this. */
  deadline?: number;
  /** Cancels everything (e.g. the whole evaluation was aborted). */
  signal?: AbortSignal;
}

interface InvokeBase {
  attempts: number;
  startedAt: Date;
  /** Wall-clock time across all attempts, including backoff — what the user experienced. */
  latencyMs: number;
}

export type InvokeOutcome =
  | (InvokeBase & { ok: true; result: GenerateResult })
  | (InvokeBase & { ok: false; error: LLMError });

/**
 * Calls a provider with the platform's resilience policy (per-attempt timeout, retry with
 * backoff) and returns a result object instead of throwing, which keeps fan-out code simple:
 * one failed model is just a value, never an exception that could sink the whole run.
 */
export async function invokeModel(
  provider: LLMProvider,
  request: Omit<GenerateRequest, "signal">,
  policy: InvokePolicy,
  hooks: RetryHooks = {},
): Promise<InvokeOutcome> {
  const startedAt = new Date();
  const start = performance.now();
  let attempts = 0;

  try {
    const { value } = await withRetry(
      (attempt) => {
        attempts = attempt;
        return provider.generate({
          ...request,
          signal: timeoutSignal(policy.timeoutMs, policy.signal),
        });
      },
      { maxRetries: policy.maxRetries, deadline: policy.deadline, signal: policy.signal },
      hooks,
    );
    return { ok: true, result: value, attempts, startedAt, latencyMs: elapsed(start) };
  } catch (error) {
    return {
      ok: false,
      error: toLLMError(error, provider.id),
      attempts,
      startedAt,
      latencyMs: elapsed(start),
    };
  }
}

function elapsed(start: number) {
  return Math.round(performance.now() - start);
}
