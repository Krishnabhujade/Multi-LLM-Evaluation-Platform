import { describe, expect, it } from "vitest";
import { createResponseOrder } from "@/lib/response-order";

describe("createResponseOrder", () => {
  it("drops a slow older response that arrives after a newer one", () => {
    const order = createResponseOrder();
    const older = order.ticket(); // e.g. a refresh while the run is still RUNNING
    const newer = order.ticket(); // the final refresh after completion
    expect(order.accept(newer)).toBe(true);
    expect(order.accept(older)).toBe(false);
  });

  it("accepts responses that arrive in order", () => {
    const order = createResponseOrder();
    const first = order.ticket();
    const second = order.ticket();
    expect(order.accept(first)).toBe(true);
    expect(order.accept(second)).toBe(true);
    expect(order.accept(order.ticket())).toBe(true);
  });
});
