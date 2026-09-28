export interface ServerSentEvent {
  event?: string;
  data: string;
}

/**
 * Parses a Server-Sent Events byte stream. `EventSource` only supports GET, and starting a run is
 * a POST, so the browser reads the fetch body with this parser instead.
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; // normalized to "\n" line endings
  let carry = ""; // a trailing "\r" that may be the first half of a CRLF split across chunks
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += (carry + decoder.decode()).replace(/\r\n?/g, "\n");
        break;
      }
      let text = carry + decoder.decode(value, { stream: true });
      carry = text.endsWith("\r") ? "\r" : "";
      if (carry) text = text.slice(0, -1);
      buffer += text.replace(/\r\n?/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const parsed = parseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (parsed) yield parsed;
        boundary = buffer.indexOf("\n\n");
      }
    }
    const trailing = parseBlock(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): ServerSentEvent | null {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue; // blank or comment (heartbeat)
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}
