import { after } from "next/server";
import type { RunEvent } from "@/lib/run-events";
import { claimRun, executeRun } from "@/server/evaluation/orchestrator";
import { getOrchestratorDeps } from "@/server/evaluation/service";
import { apiHandler } from "@/server/http/handler";
import { createEventStream } from "@/server/http/sse";

// Model calls plus judging can take a while; stay within Vercel's (Hobby) 300 s ceiling.
export const maxDuration = 300;

/**
 * Executes a PENDING evaluation and streams progress as Server-Sent Events.
 * 404 if the run does not exist, 409 if it was already started (runs execute exactly once).
 */
export const POST = apiHandler<RouteContext<"/api/evaluations/[id]/run">>(
  async (_request, context) => {
    const { id } = await context.params;
    const deps = getOrchestratorDeps();
    await claimRun(deps.store, id);

    const stream = createEventStream<RunEvent>((emit) => executeRun(id, deps, emit));
    // Keep the function alive until the run finishes, even if the browser disconnects.
    after(() => stream.done);
    return stream.response;
  },
);
