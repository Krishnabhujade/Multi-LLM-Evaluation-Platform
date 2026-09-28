import { describe, expect, it } from "vitest";
import {
  LLMError,
  errorFromHttpResponse,
  extractProviderMessage,
  parseRetryAfter,
  toLLMError,
} from "@/server/llm/errors";

const openAiError = (message: string) => JSON.stringify({ error: { message, type: "x" } });

describe("errorFromHttpResponse", () => {
  it.each([
    [401, "AUTH", false],
    [403, "AUTH", false],
    [404, "MODEL_NOT_FOUND", false],
    [408, "TIMEOUT", false],
    [413, "CONTEXT_LENGTH", false],
    [429, "RATE_LIMITED", true],
    [500, "UNAVAILABLE", true],
    [503, "UNAVAILABLE", true],
    [418, "UNKNOWN", false],
  ] as const)("maps HTTP %i to %s (retryable: %s)", (status, code, retryable) => {
    const error = errorFromHttpResponse("groq", status, openAiError("boom"), new Headers());
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.status).toBe(status);
    expect(error.providerId).toBe("groq");
  });

  it("reads retry-after on rate limits", () => {
    const error = errorFromHttpResponse(
      "groq",
      429,
      openAiError("Rate limit reached"),
      new Headers({ "retry-after": "2" }),
    );
    expect(error.retryAfterMs).toBe(2000);
    expect(error.message).toContain("Rate limit reached");
  });

  it("classifies 400s by their message", () => {
    const headers = new Headers();
    expect(
      errorFromHttpResponse(
        "x",
        400,
        openAiError("This model's maximum context length is 8192"),
        headers,
      ).code,
    ).toBe("CONTEXT_LENGTH");
    expect(
      errorFromHttpResponse("x", 400, openAiError("Blocked by content policy"), headers).code,
    ).toBe("CONTENT_FILTERED");
    expect(
      errorFromHttpResponse("x", 400, openAiError("temperature must be <= 2"), headers).code,
    ).toBe("BAD_REQUEST");
  });

  it("never echoes credentials from provider error bodies", () => {
    const body = openAiError("Invalid API key gsk_abcdefghijklmnop1234 provided");
    const error = errorFromHttpResponse("groq", 401, body, new Headers());
    expect(error.message).not.toContain("gsk_abcdefghijklmnop1234");
    expect(error.message).toContain("[REDACTED]");
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds and HTTP dates", () => {
    expect(parseRetryAfter(new Headers({ "retry-after": "1.5" }))).toBe(1500);
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(
      parseRetryAfter(new Headers({ "retry-after": "Mon, 28 Sep 2026 12:00:03 GMT" }), now),
    ).toBe(3000);
  });

  it("falls back to x-ratelimit-reset durations", () => {
    expect(parseRetryAfter(new Headers({ "x-ratelimit-reset-requests": "1m30s" }))).toBe(90_000);
    expect(parseRetryAfter(new Headers({ "x-ratelimit-reset-tokens": "250ms" }))).toBe(250);
  });

  it("returns undefined when absent or unparseable", () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined();
    expect(parseRetryAfter(new Headers({ "retry-after": "soon" }))).toBeUndefined();
  });
});

describe("extractProviderMessage", () => {
  it("handles OpenAI-style, flat and plain-text bodies", () => {
    expect(extractProviderMessage(openAiError("nested"))).toBe("nested");
    expect(extractProviderMessage(JSON.stringify({ message: "flat" }))).toBe("flat");
    expect(extractProviderMessage(JSON.stringify({ error: "string error" }))).toBe("string error");
    expect(extractProviderMessage("Bad Gateway")).toBe("Bad Gateway");
    expect(extractProviderMessage("")).toBe("No error details returned");
  });
});

describe("toLLMError", () => {
  it("maps timeouts, aborts, network failures and unknown errors", () => {
    expect(toLLMError(new DOMException("t", "TimeoutError")).code).toBe("TIMEOUT");
    expect(toLLMError(new DOMException("a", "AbortError")).code).toBe("ABORTED");
    expect(
      toLLMError(new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") })).code,
    ).toBe("NETWORK");
    expect(toLLMError(new Error("weird")).code).toBe("UNKNOWN");
  });

  it("passes LLMErrors through unchanged", () => {
    const original = new LLMError("RATE_LIMITED", "slow down");
    expect(toLLMError(original)).toBe(original);
  });
});
