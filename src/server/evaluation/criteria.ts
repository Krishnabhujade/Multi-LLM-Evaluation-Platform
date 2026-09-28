import type { RunCriterion } from "@/lib/api-types";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import type { CreateEvaluationRequest } from "@/lib/evaluation-request";

type CriterionInput = NonNullable<CreateEvaluationRequest["criteria"]>[number];

/**
 * Turns requested criteria into the full definitions the judge needs. Omitted criteria mean
 * "all built-ins at default weights"; built-ins may be referenced by key alone; zero-weight
 * criteria are dropped (they would cost judge tokens without affecting the score).
 */
export function resolveCriteria(inputs?: CriterionInput[]): RunCriterion[] {
  if (!inputs) {
    return BUILT_IN_CRITERIA.map((criterion) => ({
      key: criterion.key,
      name: criterion.name,
      description: criterion.description,
      rubric: criterion.rubric,
      weight: criterion.defaultWeight,
    }));
  }

  return inputs
    .filter((input) => input.weight > 0)
    .map((input) => {
      const builtIn = BUILT_IN_CRITERIA.find((criterion) => criterion.key === input.key);
      const name = input.name ?? builtIn?.name;
      const description = input.description ?? builtIn?.description;
      if (!name || !description) {
        throw new Error(`Criterion "${input.key}" is missing a name or description`);
      }
      const rubric = input.rubric ?? builtIn?.rubric;
      return { key: input.key, name, description, ...(rubric && { rubric }), weight: input.weight };
    });
}
