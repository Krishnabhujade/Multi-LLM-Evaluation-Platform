import { z } from "zod";

/** One criterion's verdict as the platform stores it. */
export interface CriterionVerdict {
  key: string;
  score: number;
  reason: string;
}

export interface Judgement {
  scores: CriterionVerdict[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

/** Accepts 8, "8", "8.5", "8/10", "8 / 10"; anything else is left for validation to reject. */
function coerceScore(value: unknown): unknown {
  if (typeof value === "string") {
    const match = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?\s*$/.exec(value);
    return match ? Number(match[1]) : value;
  }
  return value;
}

/** Accepts "reason"/"explanation"/"rationale" as synonyms of "reasoning". */
function normalizeVerdict(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return {
    reasoning: record.reasoning ?? record.reason ?? record.explanation ?? record.rationale,
    score: record.score,
  };
}

const VerdictSchema = z.preprocess(
  normalizeVerdict,
  z.object({
    reasoning: z.string().trim().min(1, "reasoning is required"),
    score: z.preprocess(coerceScore, z.number().min(0).max(10)),
  }),
);

const ShortList = z
  .array(z.string().trim().min(1))
  .max(10)
  .optional()
  .transform((items) => items ?? []);

/**
 * Builds the validation schema for exactly the criteria requested in a run — custom criteria
 * included. Every requested key must be present; unexpected keys are ignored.
 */
export function buildJudgementSchema(criterionKeys: string[]) {
  return z.object({
    criteria: z.object(Object.fromEntries(criterionKeys.map((key) => [key, VerdictSchema]))),
    summary: z.string().trim().min(1, "summary is required"),
    strengths: ShortList,
    weaknesses: ShortList,
  });
}
