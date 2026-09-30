import type { LlmCallDetail, ResponseDetail, RunDetail } from "@/lib/api-types";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";

const criteria = BUILT_IN_CRITERIA.map((criterion) => ({
  key: criterion.key,
  name: criterion.name,
  description: criterion.description,
  weight: criterion.defaultWeight,
}));

/** A response DTO with sensible defaults; override only what a test cares about. */
export function responseDetail(
  id: string,
  displayName: string,
  overrides: Partial<ResponseDetail> = {},
): ResponseDetail {
  const ref = `test:${id}`;
  return {
    id,
    model: {
      ref,
      providerId: "test",
      providerName: "Test",
      modelId: id,
      displayName,
      isDemo: false,
    },
    status: "SUCCESS",
    anonLabel: "A",
    content: "answer",
    finishReason: "stop",
    resolvedModel: null,
    errorCode: null,
    errorMessage: null,
    attempts: 1,
    startedAt: "2026-09-29T10:00:00.000Z",
    completedAt: "2026-09-29T10:00:01.000Z",
    latencyMs: 1000,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    estimatedCostUsd: null,
    cached: false,
    judgeStatus: "SCORED",
    judgedBy: "test:judge",
    judgeSummary: "fine",
    strengths: [],
    weaknesses: [],
    judgeError: null,
    overallScore: 8,
    rank: 1,
    scores: criteria.map((criterion) => ({
      key: criterion.key,
      name: criterion.name,
      weight: criterion.weight,
      score: 8,
      reason: "ok",
    })),
    ...overrides,
  };
}

export function callDetail(
  overrides: Partial<LlmCallDetail> & Pick<LlmCallDetail, "id">,
): LlmCallDetail {
  return {
    responseId: null,
    kind: "CANDIDATE",
    modelRef: "test:a",
    attempt: 1,
    status: "SUCCESS",
    errorCode: null,
    startedAt: "2026-09-29T10:00:00.000Z",
    latencyMs: 1000,
    inputTokens: null,
    outputTokens: null,
    ...overrides,
  };
}

export function runDetail(
  responses: ResponseDetail[],
  overrides: Partial<RunDetail> = {},
): RunDetail {
  return {
    id: "run_1",
    status: "COMPLETED",
    mode: "STANDARD",
    blind: true,
    category: "GENERAL_QA",
    prompt: "Explain DNS",
    systemPrompt: null,
    temperature: 0.7,
    maxTokens: 1024,
    autoSelected: false,
    criteria,
    judgeModel: {
      ref: "test:judge",
      providerId: "test",
      providerName: "Test",
      modelId: "judge",
      displayName: "Judge Model",
      isDemo: false,
    },
    winnerResponseId: responses[0]?.id ?? null,
    error: null,
    requestId: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    startedAt: "2026-09-29T10:00:00.000Z",
    completedAt: "2026-09-29T10:00:05.000Z",
    responses,
    calls: [],
    pairwise: [],
    ...overrides,
  };
}
