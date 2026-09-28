import { describe, expect, it } from "vitest";
import { formatModelRef, isValidModelRef, parseModelRef } from "@/lib/model-ref";

describe("model references", () => {
  it("parses provider and model id", () => {
    expect(parseModelRef("groq:llama-3.3-70b-versatile")).toEqual({
      providerId: "groq",
      modelId: "llama-3.3-70b-versatile",
    });
  });

  it("splits on the first colon only, since model ids may contain colons", () => {
    expect(parseModelRef("openrouter:qwen/qwen3.8-27b:free")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3.8-27b:free",
    });
    expect(parseModelRef("huggingface:openai/gpt-oss-20b:fastest").modelId).toBe(
      "openai/gpt-oss-20b:fastest",
    );
  });

  it.each(["groq", ":model", "groq:", "Groq:model", "gr oq:model", ""])(
    "rejects malformed reference %j",
    (ref) => {
      expect(isValidModelRef(ref)).toBe(false);
      expect(() => parseModelRef(ref)).toThrow(/Invalid model reference/);
    },
  );

  it("round-trips through formatModelRef", () => {
    const ref = "openrouter:google/gemma-4-31b-it:free";
    expect(formatModelRef(parseModelRef(ref))).toBe(ref);
  });
});
