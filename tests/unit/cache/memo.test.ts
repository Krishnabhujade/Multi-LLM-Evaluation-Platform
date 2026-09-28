import { describe, expect, it, vi } from "vitest";
import { memoizeAsync } from "@/server/cache/memo";

describe("memoizeAsync", () => {
  it("shares one in-flight load and caches it for the TTL", async () => {
    let now = 0;
    const load = vi.fn(async () => "value");
    const cached = memoizeAsync(load, { ttlMs: 1_000, now: () => now });

    await expect(Promise.all([cached(), cached()])).resolves.toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);

    now = 999;
    await cached();
    expect(load).toHaveBeenCalledTimes(1);

    now = 1_001;
    await cached();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resolves failures to undefined and retries after the failure TTL", async () => {
    let now = 0;
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("up");
    const cached = memoizeAsync(load, { ttlMs: 60_000, failureTtlMs: 100, now: () => now });

    await expect(cached()).resolves.toBeUndefined();
    now = 50;
    await expect(cached()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);

    now = 150;
    await expect(cached()).resolves.toBe("up");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
