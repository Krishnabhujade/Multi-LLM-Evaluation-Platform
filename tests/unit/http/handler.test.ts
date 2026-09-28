import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/server/http/errors";
import { apiHandler, getRequestId } from "@/server/http/handler";
import { ModelUnavailableError } from "@/server/llm/registry";

const call = (handler: ReturnType<typeof apiHandler>, headers: Record<string, string> = {}) =>
  handler(new Request("http://localhost/api/test", { headers }), {});

async function errorBody(response: Response) {
  return (await response.json()) as { error: { code: string; message: string; requestId: string } };
}

describe("apiHandler", () => {
  it("adds a request id to successful responses", async () => {
    const response = await call(apiHandler(async () => Response.json({ ok: true })));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("propagates a well-formed incoming request id", async () => {
    const response = await call(
      apiHandler(async () => Response.json({})),
      { "x-request-id": "req-123" },
    );
    expect(response.headers.get("x-request-id")).toBe("req-123");
  });

  it("maps ApiError to its status and code", async () => {
    const response = await call(
      apiHandler(async () => {
        throw new ApiError(404, "NOT_FOUND", "Evaluation not found");
      }),
    );
    expect(response.status).toBe(404);
    const body = await errorBody(response);
    expect(body.error).toMatchObject({ code: "NOT_FOUND", message: "Evaluation not found" });
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("maps validation and model-availability errors", async () => {
    const invalid = await call(
      apiHandler(async () => {
        z.object({ prompt: z.string() }).parse({});
        return Response.json({});
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await errorBody(invalid)).error.code).toBe("VALIDATION_ERROR");

    const unavailable = await call(
      apiHandler(async () => {
        throw new ModelUnavailableError("groq:x", "NOT_CONFIGURED", "Groq is not configured");
      }),
    );
    expect(unavailable.status).toBe(422);
    expect((await errorBody(unavailable)).error.code).toBe("MODEL_UNAVAILABLE");
  });

  it("hides internal error details", async () => {
    const response = await call(
      apiHandler(async () => {
        throw new Error("connection string postgres://user:secret@host/db failed");
      }),
    );
    expect(response.status).toBe(500);
    const body = await errorBody(response);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("getRequestId", () => {
  it("rejects malformed incoming ids", () => {
    const id = getRequestId(new Request("http://x", { headers: { "x-request-id": "bad id\n" } }));
    expect(id).not.toBe("bad id\n");
  });
});
