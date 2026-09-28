export interface EventStream<E> {
  response: Response;
  /** Settles when the producer finishes — even if the client disconnected earlier. */
  done: Promise<void>;
  /** Exposed for tests. */
  emit: (event: E) => void;
}

/**
 * Wraps an async producer in a Server-Sent Events response.
 *
 * The producer starts immediately and is decoupled from the connection: if the browser goes
 * away, writes become no-ops but the work continues (the route keeps the function alive with
 * `after(() => stream.done)`), so a closed tab never leaves a half-finished evaluation.
 * A comment heartbeat keeps proxies from closing an idle connection during long judge calls.
 */
export function createEventStream<E extends { type: string }>(
  producer: (emit: (event: E) => void) => Promise<void>,
  { heartbeatMs = 15_000 }: { heartbeatMs?: number } = {},
): EventStream<E> {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const write = (chunk: string) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      closed = true;
    }
  };
  const emit = (event: E) => write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      write(": connected\n\n");
      heartbeat = setInterval(() => write(": keep-alive\n\n"), heartbeatMs);

      producer(emit)
        .catch(() => undefined) // producers report their own failures as events
        .finally(() => {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            try {
              streamController.close();
            } catch {
              // Already closed by the runtime.
            }
          }
          resolveDone();
        });
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
    },
  });

  return {
    response: new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
    done,
    emit,
  };
}
