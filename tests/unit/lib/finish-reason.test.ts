import { describe, expect, it } from "vitest";
import { isCutOff } from "@/lib/finish-reason";

describe("isCutOff", () => {
  it("recognizes the output-token limit in OpenAI and Gemini formats", () => {
    expect(isCutOff("length")).toBe(true);
    expect(isCutOff("MAX_TOKENS")).toBe(true);
  });

  it("ignores normal and missing finish reasons", () => {
    for (const reason of ["stop", "STOP", "eos", null, undefined, ""]) {
      expect(isCutOff(reason)).toBe(false);
    }
  });
});
