import { z } from "zod";
import { TASK_CATEGORIES } from "@/lib/categories";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import { isValidModelRef } from "@/lib/model-ref";

export const MAX_MODELS_PER_RUN = 8;

const ModelRefSchema = z
  .string()
  .trim()
  .refine(isValidModelRef, { message: 'Expected "<provider>:<model-id>"' });

/**
 * A criterion in a request. Built-ins may be given by key and weight only; custom criteria must
 * include a name and description (the judge scores against the description).
 */
export const CriterionInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, "Keys are snake_case, 2–41 characters"),
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().min(1).max(600).optional(),
  rubric: z.string().trim().max(1_000).optional(),
  weight: z.number().min(0).max(100),
});

export const CreateEvaluationSchema = z
  .object({
    prompt: z.string().trim().min(1, "Prompt is required").max(20_000),
    systemPrompt: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .transform((value) => value || undefined),
    category: z.enum(TASK_CATEGORIES).default("GENERAL_QA"),
    models: z.array(ModelRefSchema).min(1, "Select at least one model").max(MAX_MODELS_PER_RUN),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().min(64).max(8_192).default(1_024),
    mode: z.enum(["STANDARD", "PAIRWISE"]).default("STANDARD"),
    blind: z.boolean().default(true),
    criteria: z.array(CriterionInputSchema).min(1).max(12).optional(),
    judgeModel: ModelRefSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.models).size !== value.models.length) {
      ctx.addIssue({
        code: "custom",
        path: ["models"],
        message: "Each model can be selected once",
      });
    }
    const criteria = value.criteria ?? [];
    const keys = criteria.map((criterion) => criterion.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "Criterion keys must be unique",
      });
    }
    if (criteria.length > 0 && criteria.every((criterion) => criterion.weight === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "At least one criterion needs a weight above 0",
      });
    }
    criteria.forEach((criterion, index) => {
      const builtIn = BUILT_IN_CRITERIA.some((candidate) => candidate.key === criterion.key);
      if (!builtIn && (!criterion.name || !criterion.description)) {
        ctx.addIssue({
          code: "custom",
          path: ["criteria", index],
          message: `Custom criterion "${criterion.key}" needs a name and description`,
        });
      }
    });
  });

export type CreateEvaluationInput = z.input<typeof CreateEvaluationSchema>;
export type CreateEvaluationRequest = z.output<typeof CreateEvaluationSchema>;
