import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  EvaluationMode,
  ModelSummary,
  ResponseDetail,
  RunCriterion,
  RunDetail,
} from "@/lib/api-types";
import type { TaskCategory } from "@/lib/categories";
import { formatModelRef } from "@/lib/model-ref";
import { upsertModel, upsertProvider } from "@/server/db/catalog-sync";
import type { RunStore } from "@/server/evaluation/store";
import type {
  CandidateResult,
  CandidateSlot,
  ExecutionContext,
  LlmCallRecord,
} from "@/server/evaluation/types";
import { findCatalogProvider } from "@/server/llm/catalog";
import type { ModelInfo } from "@/server/llm/types";

const RunCriteriaSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    rubric: z.string().optional(),
    weight: z.number(),
  }),
);

export interface NewRun {
  userId?: string | null;
  prompt: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  mode: EvaluationMode;
  blind: boolean;
  category: TaskCategory;
  autoSelected?: boolean;
  criteria: RunCriterion[];
  judgeModelDbId: string;
  shuffleSeed: string;
  requestId?: string;
  responses: Array<{ modelDbId: string; anonLabel: string; judgeOrder: number }>;
}

const modelWithProvider = { include: { provider: true } } as const;
type ModelRow = Prisma.ModelGetPayload<typeof modelWithProvider>;

function toModelSummary(model: ModelRow): ModelSummary {
  return {
    ref: formatModelRef({ providerId: model.providerId, modelId: model.modelId }),
    providerId: model.providerId,
    providerName: model.provider.name,
    modelId: model.modelId,
    displayName: model.displayName,
    isDemo: model.isDemo,
  };
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** JSON columns cannot hold `undefined`; build a plain JSON-safe copy of the criteria. */
function criteriaJson(criteria: RunCriterion[]): Prisma.InputJsonValue {
  return criteria.map(({ key, name, description, rubric, weight }) => ({
    key,
    name,
    description,
    weight,
    ...(rubric !== undefined && { rubric }),
  }));
}

export class PrismaEvaluationRepository implements RunStore {
  constructor(private readonly prisma: PrismaClient) {}

  /** Upserts the provider and model rows for a catalog/discovered model; returns the model row id. */
  async ensureModel(model: ModelInfo): Promise<string> {
    const provider = {
      id: model.providerId,
      name: findCatalogProvider(model.providerId)?.name ?? model.providerName,
      isDemo: model.isDemo,
    };
    await upsertProvider(this.prisma, provider);
    const row = await upsertModel(this.prisma, provider, {
      modelId: model.modelId,
      displayName: model.displayName,
      capabilities: model.capabilities,
      contextWindow: model.contextWindow,
      pricing: model.pricing,
    });
    return row.id;
  }

  async createRun(data: NewRun): Promise<string> {
    const run = await this.prisma.evaluationRun.create({
      data: {
        userId: data.userId ?? null,
        prompt: data.prompt,
        systemPrompt: data.systemPrompt ?? null,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        mode: data.mode,
        blind: data.blind,
        category: data.category,
        autoSelected: data.autoSelected ?? false,
        criteria: criteriaJson(data.criteria),
        judgeModelId: data.judgeModelDbId,
        shuffleSeed: data.shuffleSeed,
        requestId: data.requestId ?? null,
        responses: {
          create: data.responses.map((response) => ({
            modelId: response.modelDbId,
            anonLabel: response.anonLabel,
            judgeOrder: response.judgeOrder,
          })),
        },
      },
      select: { id: true },
    });
    return run.id;
  }

  async getExecutionContext(runId: string): Promise<ExecutionContext | null> {
    const run = await this.prisma.evaluationRun.findUnique({
      where: { id: runId },
      include: {
        judgeModel: modelWithProvider,
        responses: { include: { model: modelWithProvider }, orderBy: { judgeOrder: "asc" } },
      },
    });
    if (!run) return null;

    const slots: CandidateSlot[] = run.responses.map((response) => ({
      responseId: response.id,
      modelDbId: response.modelId,
      modelRef: formatModelRef({
        providerId: response.model.providerId,
        modelId: response.model.modelId,
      }),
      modelId: response.model.modelId,
      displayName: response.model.displayName,
      providerName: response.model.provider.name,
      isDemo: response.model.isDemo,
      pricing:
        response.model.inputCostPerMTok !== null && response.model.outputCostPerMTok !== null
          ? {
              inputPerMTok: response.model.inputCostPerMTok,
              outputPerMTok: response.model.outputCostPerMTok,
            }
          : undefined,
      anonLabel: response.anonLabel,
      judgeOrder: response.judgeOrder,
    }));

    return {
      run: {
        id: run.id,
        prompt: run.prompt,
        systemPrompt: run.systemPrompt,
        temperature: run.temperature,
        maxTokens: run.maxTokens,
        mode: run.mode,
        blind: run.blind,
        category: run.category,
        criteria: RunCriteriaSchema.parse(run.criteria),
        judgeModelRef: toModelSummary(run.judgeModel).ref,
        shuffleSeed: run.shuffleSeed,
        requestId: run.requestId,
      },
      slots,
    };
  }

  async markRunning(runId: string): Promise<boolean> {
    const { count } = await this.prisma.evaluationRun.updateMany({
      where: { id: runId, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    return count === 1;
  }

  async saveCandidateResult(responseId: string, result: CandidateResult): Promise<void> {
    await this.prisma.modelResponse.update({
      where: { id: responseId },
      data: {
        status: result.status,
        content: result.content ?? null,
        finishReason: result.finishReason ?? null,
        resolvedModel: result.resolvedModel ?? null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        attempts: result.attempts,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        latencyMs: result.latencyMs,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        estimatedCostUsd: result.estimatedCostUsd,
        // Failed responses are never judged.
        ...(result.status === "FAILED" && { judgeStatus: "SKIPPED" as const }),
      },
    });
  }

  async recordLlmCalls(calls: LlmCallRecord[]): Promise<void> {
    if (calls.length === 0) return;
    await this.prisma.llmCall.createMany({
      data: calls.map((call) => ({
        runId: call.runId,
        responseId: call.responseId ?? null,
        modelId: call.modelDbId,
        kind: call.kind,
        attempt: call.attempt,
        status: call.status,
        errorCode: call.errorCode ?? null,
        errorMessage: call.errorMessage ?? null,
        startedAt: call.startedAt,
        latencyMs: call.latencyMs,
        inputTokens: call.inputTokens ?? null,
        outputTokens: call.outputTokens ?? null,
        requestId: call.requestId ?? null,
      })),
    });
  }

  async completeRun(
    runId: string,
    outcome: { winnerResponseId: string | null; error?: string },
  ): Promise<void> {
    await this.prisma.evaluationRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        winnerResponseId: outcome.winnerResponseId,
        error: outcome.error ?? null,
      },
    });
  }

  async failRun(runId: string, message: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.modelResponse.updateMany({
        where: { runId, status: "PENDING" },
        data: {
          status: "FAILED",
          errorCode: "ABORTED",
          errorMessage: "The evaluation stopped before this model finished",
          judgeStatus: "SKIPPED",
        },
      }),
      this.prisma.evaluationRun.update({
        where: { id: runId },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      }),
    ]);
  }

  async getRunDetail(runId: string): Promise<RunDetail | null> {
    const run = await this.prisma.evaluationRun.findUnique({
      where: { id: runId },
      include: {
        judgeModel: modelWithProvider,
        responses: {
          include: { model: modelWithProvider, scores: true },
          orderBy: { createdAt: "asc" },
        },
        llmCalls: { include: { model: true }, orderBy: { startedAt: "asc" } },
      },
    });
    if (!run) return null;

    const criteria = RunCriteriaSchema.parse(run.criteria);
    const criterionOrder = (key: string) =>
      criteria.findIndex((criterion) => criterion.key === key);

    const responses: ResponseDetail[] = run.responses.map((response) => ({
      id: response.id,
      model: toModelSummary(response.model),
      status: response.status,
      anonLabel: response.anonLabel,
      content: response.content,
      finishReason: response.finishReason,
      resolvedModel: response.resolvedModel,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
      attempts: response.attempts,
      startedAt: iso(response.startedAt),
      completedAt: iso(response.completedAt),
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      estimatedCostUsd: response.estimatedCostUsd,
      cached: response.cached,
      judgeStatus: response.judgeStatus,
      judgedBy: response.judgedBy,
      judgeSummary: response.judgeSummary,
      strengths: response.strengths,
      weaknesses: response.weaknesses,
      judgeError: response.judgeError,
      overallScore: response.overallScore,
      rank: response.rank,
      scores: response.scores
        .map((score) => ({
          key: score.criterionKey,
          name: score.criterionName,
          weight: score.weight,
          score: score.score,
          reason: score.reason,
        }))
        .sort((a, b) => criterionOrder(a.key) - criterionOrder(b.key)),
    }));

    return {
      id: run.id,
      status: run.status,
      mode: run.mode,
      blind: run.blind,
      category: run.category,
      prompt: run.prompt,
      systemPrompt: run.systemPrompt,
      temperature: run.temperature,
      maxTokens: run.maxTokens,
      autoSelected: run.autoSelected,
      criteria,
      judgeModel: toModelSummary(run.judgeModel),
      winnerResponseId: run.winnerResponseId,
      error: run.error,
      requestId: run.requestId,
      createdAt: run.createdAt.toISOString(),
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      responses,
      calls: run.llmCalls.map((call) => ({
        id: call.id,
        responseId: call.responseId,
        kind: call.kind,
        modelRef: formatModelRef({
          providerId: call.model.providerId,
          modelId: call.model.modelId,
        }),
        attempt: call.attempt,
        status: call.status,
        errorCode: call.errorCode,
        startedAt: call.startedAt.toISOString(),
        latencyMs: call.latencyMs,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      })),
    };
  }
}
