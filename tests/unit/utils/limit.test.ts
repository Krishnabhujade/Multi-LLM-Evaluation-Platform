import { describe, expect, it } from "vitest";
import { createLimiter } from "@/server/utils/limit";

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createLimiter", () => {
  it("never runs more than N tasks at once and starts them in order", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const started: number[] = [];

    await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        limit(async () => {
          started.push(index);
          active += 1;
          peak = Math.max(peak, active);
          await tick();
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it("propagates results and errors, and keeps going after a failure", async () => {
    const limit = createLimiter(1);
    const failing = limit(async () => {
      throw new Error("boom");
    });
    const succeeding = limit(async () => 42);
    await expect(failing).rejects.toThrow("boom");
    await expect(succeeding).resolves.toBe(42);
  });

  it("rejects invalid concurrency", () => {
    expect(() => createLimiter(0)).toThrow();
  });
});
