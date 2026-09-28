import { describe, expect, it } from "vitest";
import { readServerSentEvents } from "@/lib/sse-client";
import { createEventStream } from "@/server/http/sse";

type TestEvent = { type: "tick"; n: number } | { type: "done" };

async function collect(body: ReadableStream<Uint8Array>) {
  const events: Array<{ event?: string; data: unknown }> = [];
  for await (const message of readServerSentEvents(body)) {
    events.push({ event: message.event, data: JSON.parse(message.data) });
  }
  return events;
}

describe("createEventStream + readServerSentEvents", () => {
  it("round-trips typed events and closes when the producer finishes", async () => {
    const stream = createEventStream<TestEvent>(async (emit) => {
      emit({ type: "tick", n: 1 });
      emit({ type: "tick", n: 2 });
      emit({ type: "done" });
    });

    expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
    const events = await collect(stream.response.body!);
    expect(events).toEqual([
      { event: "tick", data: { type: "tick", n: 1 } },
      { event: "tick", data: { type: "tick", n: 2 } },
      { event: "done", data: { type: "done" } },
    ]);
    await expect(stream.done).resolves.toBeUndefined();
  });

  it("keeps the producer running after the client disconnects", async () => {
    let finished = false;
    const stream = createEventStream<TestEvent>(async (emit) => {
      emit({ type: "tick", n: 1 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      emit({ type: "tick", n: 2 }); // client is gone: must be a silent no-op
      finished = true;
    });

    await stream.response.body!.cancel();
    await stream.done;
    expect(finished).toBe(true);
  });

  it("sends heartbeats that the parser ignores", async () => {
    const stream = createEventStream<TestEvent>(
      async (emit) => {
        await new Promise((resolve) => setTimeout(resolve, 35));
        emit({ type: "done" });
      },
      { heartbeatMs: 10 },
    );
    const events = await collect(stream.response.body!);
    expect(events).toEqual([{ event: "done", data: { type: "done" } }]);
  });
});

describe("readServerSentEvents", () => {
  it("handles CRLF line endings, multi-line data and chunks split mid-event", async () => {
    const chunks = [
      "event: a\r\nda",
      "ta: line1\r\ndata: line2\r\n\r\n: comment\n\n",
      "data: tail\n\n",
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const messages = [];
    for await (const message of readServerSentEvents(body)) messages.push(message);
    expect(messages).toEqual([
      { event: "a", data: "line1\nline2" },
      { event: undefined, data: "tail" },
    ]);
  });
});
