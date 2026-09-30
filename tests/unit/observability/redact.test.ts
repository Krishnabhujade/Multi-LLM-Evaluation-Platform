import { describe, expect, it } from "vitest";
import { redactSecrets, sanitizeMessage } from "@/server/observability/redact";

describe("redactSecrets", () => {
  it.each([
    ["Groq key", "key gsk_abcdefghij0123456789 leaked"],
    ["OpenRouter key", "sk-or-v1-abcdef0123456789abcdef"],
    ["OpenAI-style key", "sk-proj_abcdefghijklmnopqrstuv"],
    ["Hugging Face token", "hf_abcdefghijklmnopqrstu"],
    ["Google key", "AIzaSyA1234567890abcdefghijklmnop"],
    ["Bearer token", "Authorization: Bearer abc.def.ghi-jkl"],
  ])("removes a %s", (_label, text) => {
    const redacted = redactSecrets(text);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toMatch(/gsk_a|sk-or-v1-a|sk-proj_a|hf_ab|AIzaSyA1|abc\.def/);
  });

  it("keeps query parameter names but drops their values", () => {
    expect(redactSecrets("https://x.test/v1?key=AIzaSECRET&alt=json")).toBe(
      "https://x.test/v1?key=[REDACTED]&alt=json",
    );
  });

  it("removes organization ids that provider errors echo", () => {
    expect(
      redactSecrets(
        "Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_01abcdEFGH2345`",
      ),
    ).toBe("Rate limit reached for model `qwen/qwen3.8-27b` in organization `[REDACTED]`");
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("Rate limit reached for model llama-3.3-70b")).toBe(
      "Rate limit reached for model llama-3.3-70b",
    );
  });
});

describe("sanitizeMessage", () => {
  it("collapses whitespace and bounds length", () => {
    const message = sanitizeMessage(`line one\n\n   line two ${"x".repeat(1_000)}`, 40);
    expect(message.length).toBe(40);
    expect(message.startsWith("line one line two")).toBe(true);
    expect(message.endsWith("…")).toBe(true);
  });
});
