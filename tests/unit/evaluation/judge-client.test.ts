import { describe, expect, it } from "vitest";
import { resolveCriteria } from "@/server/evaluation/criteria";
import {
  runJudge,
  type JudgeCallTrace,
  type JudgeClientDeps,
} from "@/server/evaluation/judge/judge-client";
import { LLMError } from "@/server/llm/errors";
import { ProviderRegistry } from "@/server/llm/registry";
import type { GenerateRequest } from "@/server/llm/types";
import { createScriptedProvider, failWith } from "../../helpers/scripted-provider";

const criteria = resolveCriteria([
  { key: "accuracy", weight: 50 },
  { key: "clarity", weight: 50 },
]);

const judgementJson = (score = 8) =>
  JSON.stringify({
    criteria: {
      accuracy: { reasoning: "Correct.", score },
      clarity: { reasoning: "Clear.", score: score - 1 },
    },
    summary: "Solid answer.",
  });

const reply = (content: string) => async () => ({
  content,
  usage: { inputTokens: 300, outputTokens: 80 },
});

function setup(
  handlers: Parameters<typeof createScriptedProvider>[1],
  extra: ConstructorParameters<typeof ProviderRegistry>[0] = [],
) {
  const requests: GenerateRequest[] = [];
  const recorded = Object.fromEntries(
    Object.entries(handlers).map(([model, handler]) => [
      model,
      async (request: GenerateRequest, call: number) => {
        requests.push(request);
        return handler(request, call);
      },
    ]),
  );
  const { provider } = createScriptedProvider("judges", recorded);
  const traces: JudgeCallTrace[] = [];
  const deps: JudgeClientDeps = {
    registry: new ProviderRegistry([provider, ...extra]),
    timeoutMs: 1_000,
    maxRetries: 0,
    maxTokens: 2_000,
    deadline: Date.now() + 10_000,
    onCall: (trace) => void traces.push(trace),
  };
  return { deps, requests, traces };
}

const messages = [{ role: "user" as const, content: "judge this" }];

describe("runJudge", () => {
  it("returns a validated judgement from the primary judge", async () => {
    const { deps, requests, traces } = setup({ primary: reply(judgementJson()) });
    const result = await runJudge({ judgeRefs: ["judges:primary"], messages, criteria }, deps);

    expect(result).toMatchObject({ ok: true, judgedBy: "judges:primary" });
    expect(requests[0]).toMatchObject({ temperature: 0, responseFormat: "json", maxTokens: 2_000 });
    expect(traces).toHaveLength(1);
    expect(traces[0]!.usage).toEqual({ inputTokens: 300, outputTokens: 80 });
  });

  it("repairs malformed output by showing the judge the validation error", async () => {
    const { deps, requests } = setup({
      primary: async (_request, call) =>
        call === 1
          ? { content: '{"criteria": {"accuracy": {"reasoning": "ok", "score": 8}}}' }
          : { content: judgementJson() },
    });
    const result = await runJudge({ judgeRefs: ["judges:primary"], messages, criteria }, deps);

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
    const repair = requests[1]!.messages;
    expect(repair.at(-2)).toMatchObject({ role: "assistant" });
    expect(repair.at(-1)!.content).toMatch(/could not be used: .*clarity/);
  });

  it("falls back to the next judge when output stays invalid", async () => {
    const { deps } = setup({ primary: reply("not json at all"), backup: reply(judgementJson(6)) });
    const result = await runJudge(
      { judgeRefs: ["judges:primary", "judges:backup"], messages, criteria },
      deps,
    );

    expect(result).toMatchObject({ ok: true, judgedBy: "judges:backup" });
    if (result.ok) expect(result.judgement.scores[0]!.score).toBe(6);
  });

  it("skips unavailable judges and transport failures without repair attempts", async () => {
    const { provider: keyless } = createScriptedProvider(
      "keyless",
      { judge: reply(judgementJson()) },
      { configured: false },
    );
    const { deps, requests } = setup(
      {
        broken: failWith(() => new LLMError("AUTH", "bad key")),
        backup: reply(judgementJson()),
      },
      [keyless],
    );
    const result = await runJudge(
      { judgeRefs: ["keyless:judge", "judges:broken", "judges:backup"], messages, criteria },
      deps,
    );

    expect(result).toMatchObject({ ok: true, judgedBy: "judges:backup" });
    expect(requests.filter((request) => request.model === "broken")).toHaveLength(1);
  });

  it("returns an explanatory failure when no judge succeeds", async () => {
    const { deps } = setup({
      primary: reply("{}"),
      backup: failWith(() => new LLMError("RATE_LIMITED", "429")),
    });
    const result = await runJudge(
      { judgeRefs: ["judges:primary", "judges:backup", "nope:x"], messages, criteria },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/judges:primary: invalid output/);
      expect(result.error).toMatch(/judges:backup: RATE_LIMITED/);
      expect(result.error).toMatch(/nope:x: not available/);
    }
  });
});
