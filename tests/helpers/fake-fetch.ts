export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>;

/** A `fetch` double that records requests and answers from a responder function. */
export function createFakeFetch(responder: Responder) {
  const calls: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const request: RecordedRequest = {
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(request);
    if (init.signal?.aborted) throw init.signal.reason;
    return responder(request);
  };
  return { fetch: fetchImpl, calls };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function chatCompletion(content: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    model: "served-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    ...overrides,
  };
}
