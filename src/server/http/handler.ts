import { errorResponse } from "@/server/http/errors";

export interface RequestMeta {
  requestId: string;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Reuses a well-formed incoming `x-request-id` (e.g. from a proxy) or mints a new one. */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

/**
 * Wraps a route handler with request-id propagation and uniform error handling, so individual
 * routes only contain the happy path.
 */
export function apiHandler<Context = unknown>(
  handler: (request: Request, context: Context, meta: RequestMeta) => Promise<Response>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    const requestId = getRequestId(request);
    try {
      const response = await handler(request, context, { requestId });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}
