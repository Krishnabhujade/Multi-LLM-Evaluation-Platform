import type { RunCriterion } from "@/lib/api-types";
import { parseJudgement, type Parsed } from "@/server/evaluation/judge/parse";
import { repairInstruction } from "@/server/evaluation/judge/prompt";
import type { Judgement } from "@/server/evaluation/judge/schema";
import { invokeModel } from "@/server/llm/invoke";
import type { ProviderRegistry } from "@/server/llm/registry";
import type { AttemptRecord } from "@/server/llm/resilience";
import type { ChatMessage, ModelInfo, TokenUsage } from "@/server/llm/types";

export interface JudgeCallTrace {
  model: ModelInfo;
  attempt: AttemptRecord;
  usage?: TokenUsage;
  /** The response being judged (filled in by the strategy). */
  responseId?: string;
}

export interface JudgeClientDeps {
  registry: Pick<ProviderRegistry, "resolve">;
  timeoutMs: number;
  /** Transport retries per call (rate limits, 5xx). */
  maxRetries: number;
  maxTokens: number;
  deadline: number;
  signal?: AbortSignal;
  /** Observability hook for every judge call attempt. */
  onCall?: (trace: JudgeCallTrace) => void | Promise<void>;
}

export type StructuredJudgeResult<T> =
  { ok: true; value: T; judgedBy: string } | { ok: false; error: string };

export type JudgeResult =
  { ok: true; judgement: Judgement; judgedBy: string } | { ok: false; error: string };

/** Output-format repairs per judge model before moving on to the next judge. */
const REPAIR_ATTEMPTS = 1;

/**
 * Obtains a validated structured verdict from the judge chain, degrading gracefully:
 *   1. ask the judge (JSON mode, temperature 0);
 *   2. if the output fails validation, ask once more with the validation error attached;
 *   3. if the judge is unavailable or still invalid, try the next judge in the fallback chain.
 * Returns an error result (never throws) when every judge fails. Shared by every strategy; each
 * supplies its own parser and repair instruction.
 */
export async function runStructuredJudge<T>(
  request: {
    judgeRefs: string[];
    messages: ChatMessage[];
    parse: (text: string) => Parsed<T>;
    repair: (problem: string) => string;
  },
  deps: JudgeClientDeps,
): Promise<StructuredJudgeResult<T>> {
  const failures: string[] = [];

  for (const ref of request.judgeRefs) {
    let resolved: Awaited<ReturnType<JudgeClientDeps["registry"]["resolve"]>>;
    try {
      resolved = await deps.registry.resolve(ref);
    } catch {
      failures.push(`${ref}: not available`);
      continue;
    }

    let messages = request.messages;
    for (let attempt = 0; attempt <= REPAIR_ATTEMPTS; attempt += 1) {
      const attempts: AttemptRecord[] = [];
      const outcome = await invokeModel(
        resolved.provider,
        {
          model: resolved.model.modelId,
          messages,
          temperature: 0,
          maxTokens: deps.maxTokens,
          responseFormat: "json",
        },
        {
          timeoutMs: deps.timeoutMs,
          maxRetries: deps.maxRetries,
          deadline: deps.deadline,
          signal: deps.signal,
        },
        { onAttempt: (record) => void attempts.push(record) },
      );

      await Promise.all(
        attempts.map((record, index) =>
          deps.onCall?.({
            model: resolved.model,
            attempt: record,
            usage: outcome.ok && index === attempts.length - 1 ? outcome.result.usage : undefined,
          }),
        ),
      );

      if (!outcome.ok) {
        failures.push(`${ref}: ${outcome.error.code}`);
        break; // transport failure: repairing the format won't help, try the next judge
      }

      const parsed = request.parse(outcome.result.content);
      if (parsed.ok) return { ok: true, value: parsed.value, judgedBy: ref };

      failures.push(`${ref}: invalid output (${parsed.error})`);
      messages = [
        ...request.messages,
        { role: "assistant", content: outcome.result.content },
        { role: "user", content: request.repair(parsed.error) },
      ];
    }
  }

  return {
    ok: false,
    error: `No judge produced a valid evaluation — ${failures.join("; ") || "no judge configured"}`,
  };
}

/**
 * Pointwise judgement of one response. Returns an error result when every judge fails, so the
 * response is simply shown as "not scored" instead of failing the whole evaluation.
 */
export async function runJudge(
  request: { judgeRefs: string[]; messages: ChatMessage[]; criteria: RunCriterion[] },
  deps: JudgeClientDeps,
): Promise<JudgeResult> {
  const criterionKeys = request.criteria.map((criterion) => criterion.key);
  const result = await runStructuredJudge<Judgement>(
    {
      judgeRefs: request.judgeRefs,
      messages: request.messages,
      parse: (text) => {
        const parsed = parseJudgement(text, criterionKeys);
        return parsed.ok ? { ok: true, value: parsed.judgement } : parsed;
      },
      repair: (problem) => repairInstruction(problem, request.criteria),
    },
    deps,
  );
  return result.ok ? { ok: true, judgement: result.value, judgedBy: result.judgedBy } : result;
}
