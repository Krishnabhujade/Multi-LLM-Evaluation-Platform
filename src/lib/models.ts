import type { ModelListItem } from "@/lib/api-types";
import { CATEGORY_CAPABILITIES, type TaskCategory } from "@/lib/categories";

/** Demo judge models only make sense as judges, never as candidates. */
export function isCandidateModel(model: Pick<ModelListItem, "isDemo" | "modelId">): boolean {
  return !(model.isDemo && model.modelId.endsWith("-judge"));
}

export const AUTO_SELECT_MAX = 4;

/**
 * Providers whose models are not pre-selected on the form. OpenRouter's shared free pool is
 * often rate-limited and its free models take 7–30 s, which would hold up every default run;
 * they stay one click away in the picker and remain eligible for auto-select.
 */
export const NOT_PRESELECTED_PROVIDERS: readonly string[] = ["openrouter"];

/**
 * The form's initial selection: the first model of each connected provider (catalog order
 * puts the most reliable model first), skipping `NOT_PRESELECTED_PROVIDERS` unless nothing else
 * is available; demo models only when no real provider is configured.
 */
export function defaultModelSelection(
  models: Array<Pick<ModelListItem, "ref" | "providerId" | "modelId" | "isDemo" | "available">>,
  max = AUTO_SELECT_MAX,
): string[] {
  const available = models.filter((model) => model.available && isCandidateModel(model));
  const real = available.filter((model) => !model.isDemo);
  if (real.length > 0) {
    const preferred = real.filter((model) => !NOT_PRESELECTED_PROVIDERS.includes(model.providerId));
    const picks = new Map<string, string>(); // providerId → first model ref
    for (const model of preferred.length > 0 ? preferred : real) {
      if (!picks.has(model.providerId)) picks.set(model.providerId, model.ref);
    }
    return [...picks.values()].slice(0, max);
  }
  return available
    .filter((model) => ["demo-concise", "demo-verbose", "demo-flaky"].includes(model.modelId))
    .map((model) => model.ref);
}

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
