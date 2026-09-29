import { describe, expect, it, vi } from "vitest";
import { LLMError } from "@/server/llm/errors";
import { backoffDelay, sleep, withRetry, type AttemptRecord } from "@/server/llm/resilience";

/** Deterministic hooks: a virtual clock and a sleep that just advances it. */
function virtualTime() {
  let now = 0;
  const delays: number[] = [];
  return {
    delays,
    hooks: {
      now: () => now,
      sleep: async (ms: number) => {
        delays.push(ms);
        now += ms;
      },
      random: () => 0.5,
    },
  };
}

describe("backoffDelay", () => {
  it("grows exponentially with equal jitter and respects the cap", () => {
    expect(backoffDelay(1, 500, 8_000, () => 0)).toBe(250);
    expect(backoffDelay(1, 500, 8_000, () => 1)).toBe(500);
    expect(backoffDelay(3, 500, 8_000, () => 1)).toBe(2_000);
    expect(backoffDelay(10, 500, 8_000, () => 1)).toBe(8_000);
  });
});

describe("withRetry", () => {
  it("returns the first successful result and reports one attempt", async () => {
    const attempts: AttemptRecord[] = [];
    const result = await withRetry(
      async () => "ok",
      { maxRetries: 2 },
      {
        onAttempt: (record) => {
          attempts.push(record);
        },
      },
    );
    expect(result).toEqual({ value: "ok", attempts: 1 });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.error).toBeUndefined();
  });

  it("retries retryable errors with backoff, honouring retry-after", async () => {
    const { hooks, delays } = virtualTime();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new LLMError("RATE_LIMITED", "429", { retryAfterMs: 1_200 }))
      .mockRejectedValueOnce(new LLMError("UNAVAILABLE", "503"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(operation, { maxRetries: 2, baseDelayMs: 500 }, hooks);

    expect(result).toEqual({ value: "recovered", attempts: 3 });
    expect(delays).toEqual([1_200, 750]); // retry-after, then backoff for attempt 2 (1000 * 0.75)
  });

  it("does not retry non-retryable errors", async () => {
    const operation = vi.fn().mockRejectedValue(new LLMError("AUTH", "bad key"));
    await expect(
      withRetry(operation, { maxRetries: 3 }, virtualTime().hooks),
    ).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries and rethrows the last error", async () => {
    const attempts: AttemptRecord[] = [];
    const operation = vi.fn().mockRejectedValue(new LLMError("UNAVAILABLE", "down"));
    await expect(
      withRetry(
        operation,
        { maxRetries: 2 },
        {
          ...virtualTime().hooks,
          onAttempt: (record) => {
            attempts.push(record);
          },
        },
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(attempts.map((record) => record.error?.code)).toEqual([
      "UNAVAILABLE",
      "UNAVAILABLE",
      "UNAVAILABLE",
    ]);
  });

  it("backs off for seconds on rate limits that give no Retry-After", async () => {
    const { hooks, delays } = virtualTime();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new LLMError("RATE_LIMITED", "429 upstream"))
      .mockRejectedValueOnce(new LLMError("RATE_LIMITED", "429 upstream"))
      .mockResolvedValueOnce("ok");

    await withRetry(operation, { maxRetries: 2, rateLimitBaseDelayMs: 3_000 }, hooks);
    expect(delays).toEqual([2_250, 4_500]); // equal jitter at random 0.5 on a 3 s base
  });

  it("fails fast when the provider asks us to wait too long", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new LLMError("RATE_LIMITED", "daily quota", { retryAfterMs: 3_600_000 }));
    await expect(
      withRetry(operation, { maxRetries: 3, maxRetryAfterMs: 20_000 }, virtualTime().hooks),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("fails fast when a retry could not finish before the deadline", async () => {
    const { hooks } = virtualTime();
    const operation = vi.fn().mockRejectedValue(new LLMError("UNAVAILABLE", "down"));
    await expect(
      withRetry(operation, { maxRetries: 3, baseDelayMs: 1_000, deadline: 500 }, hooks),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("normalizes unknown thrown values into LLMErrors", async () => {
    await expect(
      withRetry(() => Promise.reject(new DOMException("t", "TimeoutError")), { maxRetries: 0 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("ignores failures inside the onAttempt hook", async () => {
    const result = await withRetry(
      async () => 42,
      { maxRetries: 0 },
      {
        onAttempt: () => {
          throw new Error("logging is down");
        },
      },
    );
    expect(result.value).toBe(42);
  });
});

describe("sleep", () => {
  it("rejects with the abort reason when the signal fires", async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort(new DOMException("stop", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects immediately for an already-aborted signal", async () => {
    await expect(sleep(10, AbortSignal.abort())).rejects.toBeDefined();
  });
});
