import { z } from "zod";
import { extractJsonObject, type Parsed } from "@/server/evaluation/judge/parse";

import type { PairOutcome } from "@/server/evaluation/types";

export interface PairwiseVerdict {
  /** Winner per criterion key, in the presentation order the judge saw. */
  criteria: Record<string, PairOutcome>;
  reasons: Record<string, string>;
  summary: string;
}

/** Accepts "A", "b", "Response A", "tie", "equal", "draw", "neither", "both". */
function normalizeOutcome(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value
    .trim()
    .toLowerCase()
    .replace(/^response\s+/, "");
  if (text === "a") return "A";
  if (text === "b") return "B";
  if (["tie", "equal", "draw", "neither", "both", "same"].includes(text)) return "TIE";
  return value;
}

const VerdictSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const record = value as Record<string, unknown>;
    return {
      reasoning: record.reasoning ?? record.reason ?? record.explanation ?? "",
      winner: record.winner ?? record.better ?? record.choice,
    };
  },
  z.object({
    reasoning: z.string(),
    winner: z.preprocess(normalizeOutcome, z.enum(["A", "B", "TIE"])),
  }),
);

const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Extracts and validates a pairwise judge reply for the given criteria. Never throws. */
export function parsePairwiseVerdict(
  text: string,
  criterionKeys: string[],
): Parsed<PairwiseVerdict> {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unparseable output" };
  }
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "expected a JSON object" };

  const record = raw as Record<string, unknown>;
  const container =
    typeof record.criteria === "object" && record.criteria !== null
      ? (record.criteria as Record<string, unknown>)
      : record;
  const byKey = new Map(
    Object.entries(container).map(([key, value]) => [normalizeKey(key), value]),
  );

  const criteria: Record<string, PairOutcome> = {};
  const reasons: Record<string, string> = {};
  for (const key of criterionKeys) {
    const result = VerdictSchema.safeParse(byKey.get(key));
    if (!result.success) {
      return {
        ok: false,
        error: `criteria.${key}: expected { reasoning, winner: "A" | "B" | "TIE" }`,
      };
    }
    criteria[key] = result.data.winner;
    reasons[key] = result.data.reasoning;
  }
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  return { ok: true, value: { criteria, reasons, summary } };
}
