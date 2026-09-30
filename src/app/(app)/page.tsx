import type { Metadata } from "next";
import { connection } from "next/server";
import { EvaluationForm } from "@/components/evaluation/evaluation-form";
import { DatabaseSetupNotice, DemoModeNotice } from "@/components/shared/setup-notice";
import { CriteriaRepository } from "@/server/db/criteria-repository";
import { getUnreliableModelRefs } from "@/server/db/model-health";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";
import { resolveJudge } from "@/server/evaluation/service";
import { getProviderRegistry } from "@/server/llm/registry";

export const metadata: Metadata = { title: "New evaluation" };

export default async function NewEvaluationPage() {
  // Provider availability depends on runtime configuration, not build-time state.
  await connection();
  const env = getEnv();
  const registry = getProviderRegistry();

  const [models, defaultJudgeRef, unreliableRefs, criteria] = await Promise.all([
    registry.listModels({ includeUnavailable: true }),
    resolveJudge(registry, env)
      .then(({ model }) => model.ref)
      .catch(() => null),
    // Recent failure data (for the auto-select preview); optional — no database, no data.
    env.DATABASE_URL ? getUnreliableModelRefs(getPrisma()).catch(() => []) : Promise.resolve([]),
    env.DATABASE_URL
      ? new CriteriaRepository(getPrisma()).list(null).catch(() => [])
      : Promise.resolve([]),
  ]);
  const providers = registry.summaries();
  const hasRealProvider = providers.some((provider) => provider.configured && !provider.isDemo);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Compare multiple AI models
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Enter one prompt → compare multiple AI models → find the strongest response. Every answer
          is scored by a blind LLM judge on the criteria you choose.
        </p>
      </div>

      {(!env.DATABASE_URL || !hasRealProvider) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {!env.DATABASE_URL && <DatabaseSetupNotice />}
          {!hasRealProvider && <DemoModeNotice />}
        </div>
      )}

      <EvaluationForm
        models={models}
        providers={providers}
        defaultJudgeRef={defaultJudgeRef}
        unreliableRefs={unreliableRefs}
        customCriteria={criteria.filter((criterion) => !criterion.isBuiltIn)}
      />
    </div>
  );
}
