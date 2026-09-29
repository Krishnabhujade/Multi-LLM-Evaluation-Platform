import type { ModelListItem } from "@/lib/api-types";
import { CATEGORY_CAPABILITIES, type TaskCategory } from "@/lib/categories";

/** Demo judge models only make sense as judges, never as candidates. */
export function isCandidateModel(model: Pick<ModelListItem, "isDemo" | "modelId">): boolean {
  return !(model.isDemo && model.modelId.endsWith("-judge"));
}

export const AUTO_SELECT_MAX = 4;

/**
 * Auto-select router: picks up to `max` callable models for a task category.
 *
 * 1. Only available candidate models; real models over demo ones when any exist; the judge is
 *    excluded when alternatives exist (so it never grades its own answer by default); models
 *    that have been failing recently (`avoid`) are skipped when alternatives exist.
 * 2. Score = how many of the category's wanted capabilities a model has (the first one counts
 *    extra); ties keep catalog order.
 * 3. One best-matching model per provider first (diverse comparisons), then fill by score.
 *
 * Pure and shared: the server uses it to resolve `autoSelect`, the form to preview the choice.
 */
export function selectModelsForCategory<
  T extends Pick<
    ModelListItem,
    "ref" | "providerId" | "modelId" | "capabilities" | "isDemo" | "available"
  >,
>(
  category: TaskCategory,
  models: T[],
  {
    judgeRef,
    avoid = [],
    max = AUTO_SELECT_MAX,
  }: { judgeRef?: string | null; avoid?: readonly string[]; max?: number } = {},
): T[] {
  const wanted = CATEGORY_CAPABILITIES[category];

  let pool = models.filter((model) => model.available && isCandidateModel(model));
  const real = pool.filter((model) => !model.isDemo);
  if (real.length > 0) pool = real;
  const withoutJudge = pool.filter((model) => model.ref !== judgeRef);
  if (withoutJudge.length > 0) pool = withoutJudge;
  const healthy = pool.filter((model) => !avoid.includes(model.ref));
  if (healthy.length > 0) pool = healthy;

  const score = (model: T) =>
    wanted.reduce(
      (total, capability, index) =>
        model.capabilities.includes(capability) ? total + (index === 0 ? 2 : 1) : total,
      0,
    );
  const ranked = pool
    .map((model, order) => ({ model, score: score(model), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const picked: T[] = [];
  const providers = new Set<string>();
  for (const { model, score: value } of ranked) {
    if (picked.length >= max) break;
    if (value > 0 && !providers.has(model.providerId)) {
      picked.push(model);
      providers.add(model.providerId);
    }
  }
  for (const { model } of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(model)) picked.push(model);
  }
  return picked;
}
