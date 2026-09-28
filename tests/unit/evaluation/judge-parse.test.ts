import { describe, expect, it } from "vitest";
import { extractJsonObject, parseJudgement } from "@/server/evaluation/judge/parse";

const keys = ["accuracy", "instruction_following"];

const valid = {
  criteria: {
    accuracy: { reasoning: "All claims correct.", score: 9 },
    instruction_following: { reasoning: "Ignored the word limit.", score: 6.5 },
  },
  summary: "Accurate but too long.",
  strengths: ["Correct"],
  weaknesses: ["Too long"],
};

describe("extractJsonObject", () => {
  it("finds JSON inside fences and prose", () => {
    const text =
      'Sure! Here is my evaluation:\n```json\n{"a": {"b": "x}y"}}\n```\nHope that helps.';
    expect(extractJsonObject(text)).toEqual({ a: { b: "x}y" } });
  });

  it("handles escaped quotes inside strings", () => {
    expect(extractJsonObject('{"q": "say \\"hi\\" {now}"}')).toEqual({ q: 'say "hi" {now}' });
  });

  it("reports missing, invalid and truncated objects", () => {
    expect(() => extractJsonObject("no json here")).toThrow(/no JSON object/);
    expect(() => extractJsonObject("{'single': 'quotes'}")).toThrow(/invalid JSON/);
    expect(() => extractJsonObject('{"criteria": {"accuracy": {"score": 8')).toThrow(/incomplete/);
  });
});

describe("parseJudgement", () => {
  it("accepts well-formed output in criterion order", () => {
    const result = parseJudgement(JSON.stringify(valid), keys);
    expect(result).toEqual({
      ok: true,
      judgement: {
        scores: [
          { key: "accuracy", score: 9, reason: "All claims correct." },
          { key: "instruction_following", score: 6.5, reason: "Ignored the word limit." },
        ],
        summary: "Accurate but too long.",
        strengths: ["Correct"],
        weaknesses: ["Too long"],
      },
    });
  });

  it("tolerates common near-misses", () => {
    const messy = {
      Accuracy: { reason: "Fine.", score: "8/10" },
      "Instruction Following": { explanation: "Good.", score: "7" },
      summary: "OK.",
    };
    const result = parseJudgement(`\`\`\`json\n${JSON.stringify(messy)}\n\`\`\``, keys);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.judgement.scores.map((score) => score.score)).toEqual([8, 7]);
      expect(result.judgement.strengths).toEqual([]);
    }
  });

  it("ignores criteria that were not requested", () => {
    const extra = {
      ...valid,
      criteria: { ...valid.criteria, creativity: { reasoning: "x", score: 1 } },
    };
    const result = parseJudgement(JSON.stringify(extra), keys);
    expect(result.ok && result.judgement.scores.map((score) => score.key)).toEqual(keys);
  });

  it.each([
    [{ ...valid, criteria: { accuracy: valid.criteria.accuracy } }, /instruction_following/],
    [
      { ...valid, criteria: { ...valid.criteria, accuracy: { reasoning: "x", score: 11 } } },
      /accuracy/,
    ],
    [
      { ...valid, criteria: { ...valid.criteria, accuracy: { reasoning: "", score: 5 } } },
      /reasoning/,
    ],
    [
      { ...valid, criteria: { ...valid.criteria, accuracy: { reasoning: "x", score: "great" } } },
      /accuracy/,
    ],
    [{ ...valid, summary: "" }, /summary/],
  ])("rejects invalid judgements with a useful message (%#)", (payload, pattern) => {
    const result = parseJudgement(JSON.stringify(payload), keys);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });

  it("never throws on garbage", () => {
    expect(parseJudgement("I refuse to answer.", keys)).toEqual({
      ok: false,
      error: "no JSON object found",
    });
  });
});
