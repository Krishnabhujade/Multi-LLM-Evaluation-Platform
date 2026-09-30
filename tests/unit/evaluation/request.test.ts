import { describe, expect, it } from "vitest";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import { CreateEvaluationSchema } from "@/lib/evaluation-request";
import { resolveCriteria } from "@/server/evaluation/criteria";

const base = {
  prompt: "Explain Kubernetes",
  models: ["groq:llama-3.3-70b-versatile", "gemini:gemini-3.8-flash"],
};

describe("CreateEvaluationSchema", () => {
  it("applies defaults", () => {
    const parsed = CreateEvaluationSchema.parse(base);
    expect(parsed).toMatchObject({
      category: "GENERAL_QA",
      temperature: 0.7,
      maxTokens: 1024,
      mode: "STANDARD",
      blind: true,
    });
    expect(parsed.criteria).toBeUndefined();
    expect(parsed.systemPrompt).toBeUndefined();
  });

  it("trims the prompt and normalizes an empty system prompt", () => {
    const parsed = CreateEvaluationSchema.parse({ ...base, prompt: "  hi  ", systemPrompt: "   " });
    expect(parsed.prompt).toBe("hi");
    expect(parsed.systemPrompt).toBeUndefined();
  });

  it.each([
    [{ prompt: "" }, "prompt"],
    [{ models: [] }, "models"],
    [{ models: ["groq"] }, "models"],
    [{ models: ["groq:a", "groq:a"] }, "models"],
    [{ temperature: 3 }, "temperature"],
    [{ maxTokens: 10 }, "maxTokens"],
    [{ criteria: [{ key: "accuracy", weight: 0 }] }, "criteria"],
    [{ criteria: [{ key: "code_quality", weight: 20 }] }, "criteria"],
    [
      {
        criteria: [
          { key: "accuracy", weight: 10 },
          { key: "accuracy", weight: 20 },
        ],
      },
      "criteria",
    ],
  ])("rejects %j", (patch, field) => {
    const result = CreateEvaluationSchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((issue) => issue.path[0] === field)).toBe(true);
  });

  it("allows an empty model list only with auto-select", () => {
    expect(CreateEvaluationSchema.parse({ prompt: "Hi", autoSelect: true })).toMatchObject({
      models: [],
      autoSelect: true,
    });
    expect(CreateEvaluationSchema.safeParse({ prompt: "Hi" }).success).toBe(false);
  });

  it("caps pairwise runs at four models", () => {
    const models = ["a", "b", "c", "d", "e"].map((id) => `groq:${id}`);
    expect(
      CreateEvaluationSchema.safeParse({ ...base, mode: "PAIRWISE", models: models.slice(0, 4) })
        .success,
    ).toBe(true);
    const tooMany = CreateEvaluationSchema.safeParse({ ...base, mode: "PAIRWISE", models });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.message).toMatch(/at most 4 models/);
    expect(CreateEvaluationSchema.safeParse({ ...base, models }).success).toBe(true);
  });

  it("accepts built-ins by key and custom criteria with a description", () => {
    const parsed = CreateEvaluationSchema.parse({
      ...base,
      criteria: [
        { key: "accuracy", weight: 50 },
        {
          key: "code_quality",
          name: "Code Quality",
          description: "Readable, maintainable code that follows good engineering practice.",
          weight: 50,
        },
      ],
    });
    expect(parsed.criteria).toHaveLength(2);
  });
});

describe("resolveCriteria", () => {
  it("defaults to every built-in at its default weight", () => {
    const criteria = resolveCriteria();
    expect(criteria.map((criterion) => criterion.key)).toEqual(BUILT_IN_CRITERIA.map((c) => c.key));
    expect(criteria.reduce((sum, criterion) => sum + criterion.weight, 0)).toBe(100);
  });

  it("fills built-in definitions, keeps custom ones and drops zero weights", () => {
    const criteria = resolveCriteria([
      { key: "clarity", weight: 30 },
      { key: "conciseness", weight: 0 },
      { key: "code_quality", name: "Code Quality", description: "Clean code.", weight: 70 },
    ]);
    expect(criteria).toEqual([
      expect.objectContaining({
        key: "clarity",
        name: "Clarity",
        weight: 30,
        rubric: expect.any(String),
      }),
      { key: "code_quality", name: "Code Quality", description: "Clean code.", weight: 70 },
    ]);
  });
});
