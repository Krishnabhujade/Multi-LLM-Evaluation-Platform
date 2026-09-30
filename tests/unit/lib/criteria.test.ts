import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CRITERIA,
  CreateCriterionSchema,
  UpdateCriterionSchema,
  criterionKeyFromName,
} from "@/lib/criteria";
import { CriterionInputSchema } from "@/lib/evaluation-request";

describe("criterionKeyFromName", () => {
  it("derives a snake_case key that requests accept", () => {
    for (const [name, key] of [
      ["Code Quality", "code_quality"],
      ["  Tone of voice! ", "tone_of_voice"],
      ["Café naïveté", "cafe_naivete"],
      ["3D modelling", "d_modelling"],
      ["Cites sources (APA)", "cites_sources_apa"],
    ] as const) {
      expect(criterionKeyFromName(name)).toBe(key);
      expect(CriterionInputSchema.shape.key.safeParse(key).success).toBe(true);
    }
  });

  it("falls back to a valid key for names without usable letters", () => {
    expect(criterionKeyFromName("✓")).toBe("custom_criterion");
    expect(criterionKeyFromName("X")).toBe("custom_x");
    expect(criterionKeyFromName("42")).toBe("custom_criterion");
  });

  it("caps the length and avoids taken keys", () => {
    const long = criterionKeyFromName("a very long criterion name that keeps going and going");
    expect(long.length).toBeLessThanOrEqual(36);
    expect(long.endsWith("_")).toBe(false);
    expect(
      criterionKeyFromName(
        "Accuracy",
        BUILT_IN_CRITERIA.map((c) => c.key),
      ),
    ).toBe("accuracy_2");
    expect(criterionKeyFromName("Tone", ["tone", "tone_2"])).toBe("tone_3");
  });
});

describe("criterion schemas", () => {
  const valid = {
    name: "Code quality",
    description: "Idiomatic, readable code with sensible naming.",
    defaultWeight: 10,
  };

  it("validates and trims fields; an empty rubric is omitted", () => {
    expect(CreateCriterionSchema.parse({ ...valid, name: "  Code quality ", rubric: " " })).toEqual(
      valid,
    );
    expect(CreateCriterionSchema.safeParse({ ...valid, description: "short" }).success).toBe(false);
    expect(CreateCriterionSchema.safeParse({ ...valid, defaultWeight: 101 }).success).toBe(false);
  });

  it("accepts partial updates and keeps an empty rubric so it can be cleared", () => {
    expect(UpdateCriterionSchema.parse({ rubric: "" })).toEqual({ rubric: "" });
    expect(UpdateCriterionSchema.parse({ defaultWeight: 20 })).toEqual({ defaultWeight: 20 });
  });
});
