import type { PrismaClient } from "@/generated/prisma/client";
import type { CatalogModel, ProviderCatalogEntry } from "@/server/llm/catalog";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";

/**
 * Upserts catalog data into the database. Used by the seed script and, at runtime, lazily when a
 * run references a model that is not in the database yet (env overrides, live discovery).
 *
 * Intentionally free of `server-only` so the standalone seed script can import it.
 */

type ProviderRow = Pick<ProviderCatalogEntry, "id" | "name" | "isDemo">;

export async function upsertProvider(prisma: PrismaClient, provider: ProviderRow) {
  return prisma.provider.upsert({
    where: { id: provider.id },
    update: { name: provider.name, isDemo: provider.isDemo },
    create: { id: provider.id, name: provider.name, isDemo: provider.isDemo },
  });
}

export async function upsertModel(
  prisma: PrismaClient,
  provider: ProviderRow,
  model: CatalogModel,
) {
  const data = {
    displayName: model.displayName,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow ?? null,
    inputCostPerMTok: model.pricing?.inputPerMTok ?? null,
    outputCostPerMTok: model.pricing?.outputPerMTok ?? null,
    isDemo: provider.isDemo,
  };
  return prisma.model.upsert({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.modelId } },
    update: data,
    create: { providerId: provider.id, modelId: model.modelId, ...data },
  });
}

/** Built-in criteria get deterministic ids so re-seeding updates rather than duplicates them. */
export async function upsertBuiltInCriteria(prisma: PrismaClient) {
  for (const criterion of BUILT_IN_CRITERIA) {
    const data = {
      key: criterion.key,
      name: criterion.name,
      description: criterion.description,
      rubric: criterion.rubric,
      defaultWeight: criterion.defaultWeight,
      isBuiltIn: true,
    };
    await prisma.criterion.upsert({
      where: { id: `builtin_${criterion.key}` },
      update: data,
      create: { id: `builtin_${criterion.key}`, ...data },
    });
  }
}
