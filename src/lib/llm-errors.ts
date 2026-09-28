/**
 * Normalized failure codes shared by every provider adapter. Provider-specific errors (HTTP
 * statuses, SDK exceptions, network failures) are mapped onto these so the orchestrator, the
 * database and the UI never deal with provider-specific error shapes.
 */
export const LLM_ERROR_CODES = [
  "TIMEOUT",
  "RATE_LIMITED",
  "AUTH",
  "MODEL_NOT_FOUND",
  "BAD_REQUEST",
  "CONTEXT_LENGTH",
  "UNAVAILABLE",
  "NETWORK",
  "CONTENT_FILTERED",
  "EMPTY_RESPONSE",
  "INVALID_RESPONSE",
  "ABORTED",
  "UNKNOWN",
] as const;

export type LLMErrorCode = (typeof LLM_ERROR_CODES)[number];

export const LLM_ERROR_LABELS: Record<LLMErrorCode, string> = {
  TIMEOUT: "Timeout",
  RATE_LIMITED: "Rate limited",
  AUTH: "Authentication failed",
  MODEL_NOT_FOUND: "Model not found",
  BAD_REQUEST: "Bad request",
  CONTEXT_LENGTH: "Context too long",
  UNAVAILABLE: "Provider unavailable",
  NETWORK: "Network error",
  CONTENT_FILTERED: "Content filtered",
  EMPTY_RESPONSE: "Empty response",
  INVALID_RESPONSE: "Invalid response",
  ABORTED: "Cancelled",
  UNKNOWN: "Unknown error",
};

export function isLLMErrorCode(value: unknown): value is LLMErrorCode {
  return typeof value === "string" && (LLM_ERROR_CODES as readonly string[]).includes(value);
}
