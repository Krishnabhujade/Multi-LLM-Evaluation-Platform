import { z } from "zod";
import { DatabaseNotConfiguredError } from "@/server/db/prisma";
import { ModelUnavailableError } from "@/server/llm/registry";
import { logger } from "@/server/observability/logger";

/** An error with an HTTP status and a stable machine-readable code, safe to show to clients. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/**
 * Converts any thrown value into the platform's consistent error response. Unexpected errors are
 * logged with the request id and reported to the client without internals.
 */
export function errorResponse(error: unknown, requestId: string): Response {
  const body = (status: number, code: string, message: string, details?: unknown) =>
    Response.json(
      {
        error: { code, message, requestId, ...(details !== undefined && { details }) },
      } satisfies ApiErrorBody,
      { status, headers: { "x-request-id": requestId } },
    );

  if (error instanceof ApiError)
    return body(error.status, error.code, error.message, error.details);
  if (error instanceof z.ZodError) {
    return body(400, "VALIDATION_ERROR", "Request validation failed", z.flattenError(error));
  }
  if (error instanceof ModelUnavailableError) {
    return body(422, "MODEL_UNAVAILABLE", error.message, { ref: error.ref, reason: error.reason });
  }
  if (error instanceof DatabaseNotConfiguredError) {
    return body(503, "DATABASE_NOT_CONFIGURED", error.message);
  }

  logger.error("Unhandled API error", { requestId, error });
  return body(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}
