"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunDetail } from "@/lib/api-types";
import type { LLMErrorCode } from "@/lib/llm-errors";
import type { RunEvent } from "@/lib/run-events";
import { readServerSentEvents } from "@/lib/sse-client";

export type RunPhase = "queued" | "calling" | "judging" | "finalizing" | "completed" | "failed";

export interface LiveModelState {
  status: "waiting" | "calling" | "succeeded" | "failed";
  latencyMs?: number;
  attempts?: number;
  errorCode?: LLMErrorCode | string;
  judge?: "pending" | "scored" | "failed";
}

const POLL_INTERVAL_MS = 1_500;

function phaseOf(run: RunDetail): RunPhase {
  if (run.status === "PENDING") return "queued";
  if (run.status === "COMPLETED") return "completed";
  if (run.status === "FAILED") return "failed";
  return run.responses.every((response) => response.status !== "PENDING") ? "judging" : "calling";
}

function liveOf(run: RunDetail): Record<string, LiveModelState> {
  return Object.fromEntries(
    run.responses.map((response) => [
      response.id,
      {
        status:
          response.status === "SUCCESS"
            ? "succeeded"
            : response.status === "FAILED"
              ? "failed"
              : run.status === "RUNNING"
                ? "calling"
                : "waiting",
        latencyMs: response.latencyMs ?? undefined,
        attempts: response.attempts,
        errorCode: response.errorCode ?? undefined,
        judge:
          response.judgeStatus === "SCORED"
            ? "scored"
            : response.judgeStatus === "FAILED"
              ? "failed"
              : response.status === "SUCCESS"
                ? "pending"
                : undefined,
      } satisfies LiveModelState,
    ]),
  );
}

/**
 * Drives the run page. A PENDING run is started here and followed over Server-Sent Events; a
 * RUNNING run (another tab, a refresh, a dropped stream) is followed by polling. Either way the
 * full run is re-fetched as models finish, so answers appear progressively.
 */
export function useRunStream(initial: RunDetail) {
  const [run, setRun] = useState(initial);
  const [phase, setPhase] = useState<RunPhase>(() => phaseOf(initial));
  const [live, setLive] = useState(() => liveOf(initial));
  const [judging, setJudging] = useState<{ completed: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const started = useRef(false);
  const mounted = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async (): Promise<RunDetail | null> => {
    try {
      const response = await fetch(`/api/evaluations/${initial.id}`, { cache: "no-store" });
      if (!response.ok) return null;
      const next = (await response.json()) as RunDetail;
      if (mounted.current) setRun(next);
      return next;
    } catch {
      return null;
    }
  }, [initial.id]);

  /** Coalesce bursts of events (several models finishing together) into one fetch. */
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), 250);
  }, [refresh]);

  const poll = useCallback(async () => {
    while (mounted.current) {
      const latest = await refresh();
      if (latest && mounted.current) {
        setLive(liveOf(latest));
        setPhase(phaseOf(latest));
        if (latest.status === "COMPLETED" || latest.status === "FAILED") return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }, [refresh]);

  const handleEvent = useCallback(
    (event: RunEvent) => {
      if (!mounted.current) return;
      switch (event.type) {
        case "run.started":
          setPhase("calling");
          setLive((current) => {
            const next = { ...current };
            for (const candidate of event.candidates) {
              next[candidate.responseId] = { ...next[candidate.responseId], status: "calling" };
            }
            return next;
          });
          break;
        case "model.completed":
          setLive((current) => ({
            ...current,
            [event.responseId]: {
              ...current[event.responseId],
              status: "succeeded",
              latencyMs: event.latencyMs,
              attempts: event.attempts,
              judge: "pending",
            },
          }));
          scheduleRefresh();
          break;
        case "model.failed":
          setLive((current) => ({
            ...current,
            [event.responseId]: {
              ...current[event.responseId],
              status: "failed",
              latencyMs: event.latencyMs,
              attempts: event.attempts,
              errorCode: event.errorCode,
            },
          }));
          scheduleRefresh();
          break;
        case "judging.started":
          setPhase("judging");
          setJudging({ completed: 0, total: event.total });
          break;
        case "judging.progress":
          setJudging({ completed: event.completed, total: event.total });
          setLive((current) => ({
            ...current,
            [event.responseId]: {
              ...current[event.responseId]!,
              judge: event.status === "SCORED" ? "scored" : "failed",
            },
          }));
          scheduleRefresh();
          break;
        case "run.completed":
          setPhase("finalizing");
          break;
        case "run.failed":
          setPhase("failed");
          break;
      }
    },
    [scheduleRefresh],
  );

  const stream = useCallback(async () => {
    // Phase moves to "calling" on the run.started event; no state is set before the first await.
    let response: Response;
    try {
      response = await fetch(`/api/evaluations/${initial.id}/run`, {
        method: "POST",
        headers: { accept: "text/event-stream" },
      });
    } catch {
      return poll();
    }

    // 409: already started elsewhere (another tab or a double mount) — just follow it.
    if (response.status === 409) return poll();
    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setNotice(payload?.error?.message ?? "The evaluation could not be started.");
      const latest = await refresh();
      if (latest) setPhase(phaseOf(latest));
      return;
    }

    try {
      for await (const message of readServerSentEvents(response.body)) {
        handleEvent(JSON.parse(message.data) as RunEvent);
      }
    } catch {
      // Connection dropped; the run continues server-side — fall through to polling.
    }

    clearTimeout(refreshTimer.current);
    const latest = await refresh();
    if (!latest || latest.status === "RUNNING" || latest.status === "PENDING") return poll();
    if (mounted.current) {
      setLive(liveOf(latest));
      setPhase(phaseOf(latest));
    }
  }, [handleEvent, initial.id, poll, refresh]);

  useEffect(() => {
    mounted.current = true;
    // Start after mount from a timer the cleanup cancels: under React Strict Mode's simulated
    // unmount/remount the first timer never fires, so a run is started exactly once.
    const start = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      if (initial.status === "PENDING") void stream();
      else if (initial.status === "RUNNING") void poll();
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(start);
      clearTimeout(refreshTimer.current);
    };
  }, [initial.status, poll, stream]);

  return { run, phase, live, judging, notice };
}
