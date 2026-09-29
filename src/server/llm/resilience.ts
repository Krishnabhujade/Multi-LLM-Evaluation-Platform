import { LLMError, toLLMError } from "@/server/llm/errors";

/** Resolves after `ms`, or rejects with the signal's reason as soon as it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** A signal that aborts after `timeoutMs` or when `parent` aborts, whichever comes first. */
export function timeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/** Exponential backoff with "equal jitter": half fixed, half random, capped at `maxDelayMs`. */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exponential / 2 + random() * (exponential / 2));
}

export interface AttemptRecord {
  /** 1-based attempt number. */
  attempt: number;
  startedAt: Date;
  latencyMs: number;
  /** Present when the attempt failed. */
  error?: LLMError;
}

export interface RetryPolicy {
  /** Additional attempts after the first one. */
  maxRetries: number;
  baseDelayMs?: number;
  /**
   * Base delay for rate limits that come without a Retry-After hint. Rate limits clear on a
   * scale of seconds, so sub-second retries would just burn attempts.
   */
  rateLimitBaseDelayMs?: number;
  maxDelayMs?: number;
  /** A provider asking us to wait longer than this is treated as a hard failure. */
  maxRetryAfterMs?: number;
  /** Epoch ms; a retry that could not start before this is skipped. */
  deadline?: number;
  signal?: AbortSignal;
}

export interface RetryHooks {
  /** Called after every attempt (success or failure) — used for the LlmCall trace. */
  onAttempt?: (record: AttemptRecord) => void | Promise<void>;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

/**
 * Runs `operation` and retries it on retryable `LLMError`s (rate limits, 5xx, network).
 * Honours `Retry-After`, but fails fast when waiting would exceed the deadline or cap — a
 * fast, honest "rate limited" beats a hung evaluation. Non-retryable errors are rethrown at once.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  hooks: RetryHooks = {},
): Promise<{ value: T; attempts: number }> {
  const {
    maxRetries,
    baseDelayMs = 500,
    rateLimitBaseDelayMs = 3_000,
    maxDelayMs = 8_000,
    maxRetryAfterMs = 20_000,
    deadline,
    signal,
  } = policy;
  const now = hooks.now ?? Date.now;
  const wait = hooks.sleep ?? sleep;

  for (let attempt = 1; ; attempt += 1) {
    const started = now();
    try {
      const value = await operation(attempt);
      await report(hooks, { attempt, startedAt: new Date(started), latencyMs: now() - started });
      return { value, attempts: attempt };
    } catch (raw) {
      const error = toLLMError(raw);
      await report(hooks, {
        attempt,
        startedAt: new Date(started),
        latencyMs: now() - started,
        error,
      });

      if (!error.retryable || attempt > maxRetries || signal?.aborted) throw error;
      const base = error.code === "RATE_LIMITED" ? rateLimitBaseDelayMs : baseDelayMs;
      const delay = error.retryAfterMs ?? backoffDelay(attempt, base, maxDelayMs, hooks.random);
      if (delay > maxRetryAfterMs) throw error;
      if (deadline !== undefined && now() + delay >= deadline) throw error;

      try {
        await wait(delay, signal);
      } catch {
        throw error; // aborted while backing off: surface the original failure
      }
    }
  }
}

async function report(hooks: RetryHooks, record: AttemptRecord) {
  try {
    await hooks.onAttempt?.(record);
  } catch {
    // Observability hooks must never break the call they observe.
  }
}
