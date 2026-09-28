import { describe, expect, it } from "vitest";
import { TaskCategory } from "@/generated/prisma/enums";
import { CAPABILITIES } from "@/lib/capabilities";
import { TASK_CATEGORIES } from "@/lib/categories";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import { PROVIDER_CATALOG } from "@/server/llm/catalog";

describe("task categories", () => {
  it("match the Prisma TaskCategory enum exactly", () => {
    expect([...TASK_CATEGORIES].sort()).toEqual(Object.values(TaskCategory).sort());
  });
});

describe("built-in criteria", () => {
  it("default weights sum to 100", () => {
    const total = BUILT_IN_CRITERIA.reduce((sum, criterion) => sum + criterion.defaultWeight, 0);
    expect(total).toBe(100);
  });

  it("use unique snake_case keys", () => {
    const keys = BUILT_IN_CRITERIA.map((criterion) => criterion.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe("provider catalog", () => {
  it("has unique provider ids and unique model ids per provider", () => {
    const providerIds = PROVIDER_CATALOG.map((provider) => provider.id);
    expect(new Set(providerIds).size).toBe(providerIds.length);

    for (const provider of PROVIDER_CATALOG) {
      const modelIds = provider.models.map((model) => model.modelId);
      expect(new Set(modelIds).size, provider.id).toBe(modelIds.length);
    }
  });

  it("only uses known capability tags and non-negative pricing", () => {
    for (const provider of PROVIDER_CATALOG) {
      for (const model of provider.models) {
        for (const capability of model.capabilities) expect(CAPABILITIES).toContain(capability);
        if (model.pricing) {
          expect(model.pricing.inputPerMTok).toBeGreaterThanOrEqual(0);
          expect(model.pricing.outputPerMTok).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("flags only the demo provider as development data", () => {
    const demoProviders = PROVIDER_CATALOG.filter((provider) => provider.isDemo);
    expect(demoProviders.map((provider) => provider.id)).toEqual(["demo"]);
  });
});
