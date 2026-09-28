import { LLM_ERROR_LABELS, type LLMErrorCode } from "@/lib/llm-errors";
import { sanitizeMessage } from "@/server/observability/redact";

/** Failures worth retrying: transient capacity or connectivity problems. */
const RETRYABLE_CODES: ReadonlySet<LLMErrorCode> = new Set([
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NETWORK",
]);

export interface LLMErrorOptions {
  status?: number;
  retryAfterMs?: number;
  providerId?: string;
  cause?: unknown;
}

/**
 * The single error type that leaves a provider adapter. `message` is always safe to persist and
 * show to users: it is redacted and length-bounded.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly providerId?: string;

  constructor(code: LLMErrorCode, message: string, options: LLMErrorOptions = {}) {
    super(sanitizeMessage(message), { cause: options.cause });
    this.name = "LLMError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.providerId = options.providerId;
  }
}

export function isLLMError(error: unknown): error is LLMError {
  return error instanceof LLMError;
}

/**
 * Parses `Retry-After` (delta-seconds or HTTP-date) and provider-specific reset headers.
 * Returns milliseconds, or undefined when absent/unparseable.
 */
export function parseRetryAfter(headers: Headers, now = Date.now()): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  // Groq / OpenAI style: "x-ratelimit-reset-requests: 2.5s" or "1m30s" or "120ms".
  const reset =
    headers.get("x-ratelimit-reset-requests") ?? headers.get("x-ratelimit-reset-tokens");
  if (reset) return parseDurationMs(reset);
  return undefined;
}

function parseDurationMs(value: string): number | undefined {
  const pattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of value.matchAll(pattern)) {
    matched = true;
    const n = Number(amount);
    total +=
      unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60_000 : n * 3_600_000;
  }
  return matched ? Math.round(total) : undefined;
}

/** Pulls a human-readable message out of common provider error bodies. */
export function extractProviderMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    const candidates = [
      getPath(parsed, ["error", "message"]),
      getPath(parsed, ["error", "metadata", "raw"]),
      getPath(parsed, ["message"]),
      getPath(parsed, ["error"]),
      getPath(parsed, ["detail"]),
    ];
    const message = candidates.find((value) => typeof value === "string" && value.trim());
    if (typeof message === "string") return message;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return body || "No error details returned";
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const CONTEXT_LENGTH_PATTERN =
  /context[ _-]?(length|window)|maximum context|too many tokens|prompt is too long|reduce the length/i;
const CONTENT_FILTER_PATTERN = /content[ _-]?(policy|filter|management)|safety|blocked|moderation/i;

/** Maps a non-2xx HTTP response to a normalized error. */
export function errorFromHttpResponse(
  providerId: string,
  status: number,
  body: string,
  headers: Headers,
): LLMError {
  const detail = extractProviderMessage(body);
  const options: LLMErrorOptions = { status, providerId };

  if (status === 401 || status === 403) {
    return new LLMError("AUTH", `Authentication failed (${status}): ${detail}`, options);
  }
  if (status === 404) return new LLMError("MODEL_NOT_FOUND", detail, options);
  if (status === 408) return new LLMError("TIMEOUT", `Provider timed out: ${detail}`, options);
  if (status === 413) return new LLMError("CONTEXT_LENGTH", detail, options);
  if (status === 429) {
    return new LLMError("RATE_LIMITED", `Rate limited: ${detail}`, {
      ...options,
      retryAfterMs: parseRetryAfter(headers),
    });
  }
  if (status === 400 || status === 422) {
    if (CONTEXT_LENGTH_PATTERN.test(detail)) return new LLMError("CONTEXT_LENGTH", detail, options);
    if (CONTENT_FILTER_PATTERN.test(detail)) {
      return new LLMError("CONTENT_FILTERED", detail, options);
    }
    return new LLMError("BAD_REQUEST", detail, options);
  }
  if (status >= 500) {
    return new LLMError("UNAVAILABLE", `Provider error (${status}): ${detail}`, {
      ...options,
      retryAfterMs: parseRetryAfter(headers),
    });
  }
  return new LLMError("UNKNOWN", `Unexpected status ${status}: ${detail}`, options);
}

/** Normalizes anything thrown while calling a provider (fetch failures, aborts, bugs). */
export function toLLMError(error: unknown, providerId?: string): LLMError {
  if (error instanceof LLMError) return error;

  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "TimeoutError") {
    return new LLMError("TIMEOUT", "The model did not respond before the timeout", {
      providerId,
      cause: error,
    });
  }
  if (name === "AbortError") {
    return new LLMError("ABORTED", "The request was cancelled", { providerId, cause: error });
  }
  if (error instanceof TypeError) {
    // undici reports connection failures as `TypeError: fetch failed` with a `cause`.
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return new LLMError("NETWORK", `Network error${cause}`, { providerId, cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new LLMError("UNKNOWN", message || LLM_ERROR_LABELS.UNKNOWN, { providerId, cause: error });
}
