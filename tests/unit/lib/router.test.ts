import { describe, expect, it } from "vitest";
import type { Capability } from "@/lib/capabilities";
import { selectModelsForCategory } from "@/lib/models";

const model = (
  ref: string,
  capabilities: Capability[],
  overrides: Partial<{ available: boolean; isDemo: boolean }> = {},
) => {
  const [providerId, modelId] = [ref.split(":")[0]!, ref.split(":").slice(1).join(":")];
  return { ref, providerId, modelId, capabilities, available: true, isDemo: false, ...overrides };
};

const catalog = [
  model("groq:qwen", ["general", "coding", "reasoning"]),
  model("groq:gpt-oss-120b", ["general", "reasoning", "coding", "math"]),
  model("gemini:flash-lite", ["general", "fast", "long-context"]),
  model("gemini:flash", ["general", "reasoning", "coding", "math", "creative", "long-context"]),
  model("openrouter:nemotron", ["general", "reasoning"]),
  model("openrouter:coder", ["general", "coding"]),
  model("huggingface:llama", ["general", "creative", "multilingual"]),
  model("demo:demo-concise", ["general"], { isDemo: true }),
];

const refs = (items: Array<{ ref: string }>) => items.map((item) => item.ref);

describe("selectModelsForCategory", () => {
  it("takes the best match per provider first, then fills by score", () => {
    // Llama (no coding tags) loses the last slot to a second strong coding model.
    expect(refs(selectModelsForCategory("CODING", catalog))).toEqual([
      "groq:qwen",
      "gemini:flash",
      "openrouter:coder",
      "groq:gpt-oss-120b",
    ]);
  });

  it("picks math/reasoning models for mathematics", () => {
    const picked = refs(selectModelsForCategory("MATHEMATICS", catalog));
    expect(picked.slice(0, 2)).toEqual(["groq:gpt-oss-120b", "gemini:flash"]);
    expect(picked).toContain("openrouter:nemotron");
  });

  it("excludes the judge when alternatives exist", () => {
    const picked = refs(
      selectModelsForCategory("MATHEMATICS", catalog, { judgeRef: "groq:gpt-oss-120b" }),
    );
    expect(picked).not.toContain("groq:gpt-oss-120b");
    expect(picked[0]).toBe("gemini:flash");
  });

  it("skips unavailable models and prefers real models over demo ones", () => {
    const limited = [
      model("groq:qwen", ["coding"], { available: false }),
      model("demo:demo-concise", ["general"], { isDemo: true }),
      model("gemini:flash-lite", ["general"]),
    ];
    expect(refs(selectModelsForCategory("GENERAL_QA", limited))).toEqual(["gemini:flash-lite"]);
  });

  it("falls back to demo models (never the demo judge) when nothing real is available", () => {
    const demoOnly = [
      model("demo:demo-concise", ["general", "fast"], { isDemo: true }),
      model("demo:demo-judge", ["general"], { isDemo: true }),
    ];
    expect(refs(selectModelsForCategory("GENERAL_QA", demoOnly))).toEqual(["demo:demo-concise"]);
  });

  it("avoids recently failing models while alternatives exist", () => {
    const picked = refs(selectModelsForCategory("CODING", catalog, { avoid: ["gemini:flash"] }));
    // Flash-Lite has no coding tags, so the freed slot goes to the next-best coding model.
    expect(picked).toEqual([
      "groq:qwen",
      "openrouter:coder",
      "groq:gpt-oss-120b",
      "openrouter:nemotron",
    ]);

    const onlyFailing = [model("gemini:flash", ["coding"])];
    expect(
      refs(selectModelsForCategory("CODING", onlyFailing, { avoid: ["gemini:flash"] })),
    ).toEqual(["gemini:flash"]);
  });

  it("fills beyond one-per-provider when there are few providers, up to the max", () => {
    const twoProviders = catalog.filter(
      (entry) => entry.providerId === "groq" || entry.providerId === "gemini",
    );
    expect(selectModelsForCategory("GENERAL_QA", twoProviders)).toHaveLength(4);
    expect(selectModelsForCategory("GENERAL_QA", catalog, { max: 2 })).toHaveLength(2);
  });
});
