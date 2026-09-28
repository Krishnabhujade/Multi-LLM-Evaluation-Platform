import { buildJudgementSchema, type Judgement } from "@/server/evaluation/judge/schema";

export type ParseResult = { ok: true; judgement: Judgement } | { ok: false; error: string };

/**
 * Finds the first balanced top-level JSON object in model output, tolerating markdown fences and
 * prose around it. String-aware, so braces inside string values do not confuse it.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object found");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as unknown;
        } catch (error) {
          throw new Error(
            `invalid JSON (${error instanceof Error ? error.message : "parse error"})`,
          );
        }
      }
    }
  }
  throw new Error("JSON object is incomplete (the output may have been truncated)");
}

const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/**
 * Normalizes common near-misses before validation: criterion keys written as "Instruction
 * Following", and verdicts placed at the top level instead of under "criteria".
 */
function normalizeShape(value: unknown, criterionKeys: string[]): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;

  const container =
    typeof record.criteria === "object" && record.criteria !== null
      ? (record.criteria as Record<string, unknown>)
      : record;
  const criteria: Record<string, unknown> = {};
  for (const [key, verdict] of Object.entries(container)) {
    const normalized = normalizeKey(key);
    if (criterionKeys.includes(normalized)) criteria[normalized] = verdict;
  }
  return { ...record, criteria };
}

function describeIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Extracts, normalizes and validates a judge reply for the given criteria. Never throws. */
export function parseJudgement(text: string, criterionKeys: string[]): ParseResult {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unparseable output" };
  }

  const result = buildJudgementSchema(criterionKeys).safeParse(normalizeShape(raw, criterionKeys));
  if (!result.success) return { ok: false, error: describeIssues(result.error.issues) };

  const { criteria, summary, strengths, weaknesses } = result.data;
  return {
    ok: true,
    judgement: {
      scores: criterionKeys.map((key) => {
        const verdict = criteria[key] as { reasoning: string; score: number };
        return { key, score: verdict.score, reason: verdict.reasoning };
      }),
      summary,
      strengths,
      weaknesses,
    },
  };
}
