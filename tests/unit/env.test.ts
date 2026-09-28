import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

describe("parseEnv", () => {
  it("applies defaults when variables are missing", () => {
    const env = parseEnv({ NODE_ENV: "development" });

    expect(env.MODEL_TIMEOUT_MS).toBe(45_000);
    expect(env.MODEL_MAX_RETRIES).toBe(2);
    expect(env.JUDGE_MODEL).toBe("gemini:gemini-3.8-flash");
    expect(env.JUDGE_FALLBACK_MODELS).toEqual([
      "groq:openai/gpt-oss-120b",
      "groq:llama-3.3-70b-versatile",
    ]);
    expect(env.OPENROUTER_FREE_ONLY).toBe(true);
    expect(env.GROQ_MODELS).toEqual([]);
  });

  it("treats empty placeholders as unset", () => {
    const env = parseEnv({ GROQ_API_KEY: "", JUDGE_MODEL: "  ", MODEL_TIMEOUT_MS: "" });

    expect(env.GROQ_API_KEY).toBeUndefined();
    expect(env.JUDGE_MODEL).toBe("gemini:gemini-3.8-flash");
    expect(env.MODEL_TIMEOUT_MS).toBe(45_000);
  });

  it("parses comma-separated model lists and booleans", () => {
    const env = parseEnv({
      GROQ_MODELS: "llama-3.3-70b-versatile, openai/gpt-oss-120b,,",
      OPENROUTER_FREE_ONLY: "false",
      ENABLE_DEMO_PROVIDER: "1",
    });

    expect(env.GROQ_MODELS).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
    expect(env.OPENROUTER_FREE_ONLY).toBe(false);
    expect(env.ENABLE_DEMO_PROVIDER).toBe(true);
  });

  it("enables the demo provider by default outside production only", () => {
    expect(parseEnv({ NODE_ENV: "development" }).ENABLE_DEMO_PROVIDER).toBe(true);
    expect(parseEnv({ NODE_ENV: "production" }).ENABLE_DEMO_PROVIDER).toBe(false);
  });

  it("rejects invalid values without echoing them", () => {
    const secretLookingValue = "not-a-number-sk-12345";

    expect(() => parseEnv({ MODEL_TIMEOUT_MS: secretLookingValue })).toThrow(/MODEL_TIMEOUT_MS/);
    expect(() => parseEnv({ MODEL_TIMEOUT_MS: secretLookingValue })).not.toThrow(
      new RegExp(secretLookingValue),
    );
  });
});
