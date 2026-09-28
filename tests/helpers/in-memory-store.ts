import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import type { RunStatus } from "@/lib/api-types";
import { parseModelRef } from "@/lib/model-ref";
import { anonLabel } from "@/server/evaluation/shuffle";
import type { RunStore } from "@/server/evaluation/store";
import type {
  CandidateResult,
  CandidateSlot,
  ExecutionContext,
  LlmCallRecord,
  RunConfig,
} from "@/server/evaluation/types";
import type { ModelPricing } from "@/server/llm/catalog";

interface RunState {
  status: RunStatus;
  winnerResponseId: string | null;
  error?: string;
}

/** RunStore test double: same contract as the Prisma repository, backed by Maps. */
export class InMemoryRunStore implements RunStore {
  readonly contexts = new Map<string, ExecutionContext>();
  readonly runs = new Map<string, RunState>();
  readonly results = new Map<string, CandidateResult>();
  readonly calls: LlmCallRecord[] = [];

  add(context: ExecutionContext) {
    this.contexts.set(context.run.id, context);
    this.runs.set(context.run.id, { status: "PENDING", winnerResponseId: null });
    return context;
  }

  run(runId: string) {
    return this.runs.get(runId)!;
  }

  async getExecutionContext(runId: string) {
    return this.contexts.get(runId) ?? null;
  }

  async markRunning(runId: string) {
    const run = this.runs.get(runId);
    if (!run || run.status !== "PENDING") return false;
    run.status = "RUNNING";
    return true;
  }

  async saveCandidateResult(responseId: string, result: CandidateResult) {
    this.results.set(responseId, result);
  }

  async recordLlmCalls(calls: LlmCallRecord[]) {
    this.calls.push(...calls);
  }

  async completeRun(runId: string, outcome: { winnerResponseId: string | null; error?: string }) {
    Object.assign(this.run(runId), { status: "COMPLETED", ...outcome });
  }

  async failRun(runId: string, message: string) {
    Object.assign(this.run(runId), { status: "FAILED", error: message });
  }
}

let counter = 0;

/** Builds an execution context for the given model refs (slot order = judging order). */
export function buildContext(
  models: Array<string | { ref: string; pricing?: ModelPricing }>,
  overrides: Partial<RunConfig> = {},
): ExecutionContext {
  counter += 1;
  const runId = overrides.id ?? `run_${counter}`;
  const slots: CandidateSlot[] = models.map((entry, index) => {
    const { ref, pricing } = typeof entry === "string" ? { ref: entry, pricing: undefined } : entry;
    const { providerId, modelId } = parseModelRef(ref);
    return {
      responseId: `${runId}_resp_${index}`,
      modelDbId: `db_${ref}`,
      modelRef: ref,
      modelId,
      displayName: modelId,
      providerName: providerId,
      isDemo: providerId === "demo",
      pricing,
      anonLabel: anonLabel(index),
      judgeOrder: index,
    };
  });
  return {
    run: {
      id: runId,
      prompt: "Explain how blockchain works to a beginner.",
      systemPrompt: null,
      temperature: 0.7,
      maxTokens: 512,
      mode: "STANDARD",
      blind: true,
      category: "GENERAL_QA",
      criteria: BUILT_IN_CRITERIA.map((criterion) => ({
        key: criterion.key,
        name: criterion.name,
        description: criterion.description,
        rubric: criterion.rubric,
        weight: criterion.defaultWeight,
      })),
      judgeModelRef: "demo:demo-judge",
      shuffleSeed: "seed",
      requestId: "req-test",
      ...overrides,
    },
    slots,
  };
}
