import "server-only";
import type { RunDetail } from "@/lib/api-types";
import type { CreateEvaluationRequest } from "@/lib/evaluation-request";
import { PrismaEvaluationRepository } from "@/server/db/evaluation-repository";
import { getPrisma } from "@/server/db/prisma";
import { getEnv, type Env } from "@/server/env";
import { resolveCriteria } from "@/server/evaluation/criteria";
import type { OrchestratorDeps } from "@/server/evaluation/orchestrator";
import { anonLabel, newShuffleSeed, seededShuffle } from "@/server/evaluation/shuffle";
import { ApiError } from "@/server/http/errors";
import { getProviderRegistry, type ProviderRegistry } from "@/server/llm/registry";
import { logger } from "@/server/observability/logger";

/** Overall budget for one run — below Vercel's 300 s function limit, leaving room to persist. */
export const RUN_BUDGET_MS = 240_000;
/** A run still RUNNING after this long was killed mid-flight (e.g. by a platform timeout). */
const STALE_RUN_MS = 330_000;

let repository: PrismaEvaluationRepository | undefined;

export function getEvaluationRepository(): PrismaEvaluationRepository {
  repository ??= new PrismaEvaluationRepository(getPrisma());
  return repository;
}

export function getOrchestratorDeps(): OrchestratorDeps {
  const env = getEnv();
  return {
    store: getEvaluationRepository(),
    registry: getProviderRegistry(),
    timeoutMs: env.MODEL_TIMEOUT_MS,
    maxRetries: env.MODEL_MAX_RETRIES,
    runBudgetMs: RUN_BUDGET_MS,
    logger,
    judge: {
      // Real fallbacks only: a synthetic demo score must never stand in for a real judgement.
      fallbackRefs: env.JUDGE_FALLBACK_MODELS,
      concurrency: env.JUDGE_CONCURRENCY,
      maxTokens: env.JUDGE_MAX_TOKENS,
    },
  };
}

/**
 * Picks the judge: an explicitly requested model must be available; otherwise the configured
 * judge, then each fallback, then (in development) the synthetic demo judge.
 */
export async function resolveJudge(registry: ProviderRegistry, env: Env, requested?: string) {
  if (requested) return registry.resolve(requested);

  const candidates = [
    env.JUDGE_MODEL,
    ...env.JUDGE_FALLBACK_MODELS,
    ...(env.ENABLE_DEMO_PROVIDER ? ["demo:demo-judge"] : []),
  ];
  for (const ref of candidates) {
    try {
      return await registry.resolve(ref);
    } catch {
      // Not configured — try the next candidate.
    }
  }
  throw new ApiError(
    422,
    "NO_JUDGE_AVAILABLE",
    "No judge model is available. Set JUDGE_MODEL and the matching provider API key.",
  );
}

export async function createEvaluation(
  input: CreateEvaluationRequest,
  meta: { requestId: string; userId?: string | null },
): Promise<{ id: string }> {
  const env = getEnv();
  const registry = getProviderRegistry();
  const repo = getEvaluationRepository();

  if (input.mode === "PAIRWISE") {
    throw new ApiError(400, "MODE_NOT_SUPPORTED", "Pairwise evaluation is not available yet.");
  }

  // Throws ModelUnavailableError (HTTP 422) for unknown or unconfigured models.
  const candidates = await Promise.all(input.models.map((ref) => registry.resolve(ref)));
  const judge = await resolveJudge(registry, env, input.judgeModel);
  const criteria = resolveCriteria(input.criteria);

  const [modelDbIds, judgeModelDbId] = await Promise.all([
    Promise.all(candidates.map(({ model }) => repo.ensureModel(model))),
    repo.ensureModel(judge.model),
  ]);

  // Seeded shuffle → judging order and anonymous labels are decoupled from selection order.
  const shuffleSeed = newShuffleSeed();
  const judgingOrder = seededShuffle(
    candidates.map((_, index) => index),
    shuffleSeed,
  );

  const id = await repo.createRun({
    userId: meta.userId,
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    mode: input.mode,
    blind: input.blind,
    category: input.category,
    criteria,
    judgeModelDbId,
    shuffleSeed,
    requestId: meta.requestId,
    responses: candidates.map((_, index) => {
      const position = judgingOrder.indexOf(index);
      return {
        modelDbId: modelDbIds[index]!,
        anonLabel: anonLabel(position),
        judgeOrder: position,
      };
    }),
  });

  logger.info("Evaluation created", {
    runId: id,
    requestId: meta.requestId,
    models: input.models,
    judge: judge.model.ref,
  });
  return { id };
}

export async function getEvaluation(id: string): Promise<RunDetail | null> {
  const repo = getEvaluationRepository();
  const run = await repo.getRunDetail(id);
  if (
    run?.status === "RUNNING" &&
    run.startedAt &&
    Date.now() - Date.parse(run.startedAt) > STALE_RUN_MS
  ) {
    await repo.failRun(id, "The evaluation did not finish in time and was stopped.");
    return repo.getRunDetail(id);
  }
  return run;
}
