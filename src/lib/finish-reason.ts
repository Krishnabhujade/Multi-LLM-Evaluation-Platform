/**
 * Whether a model stopped because it hit the output-token limit rather than finishing its
 * answer ("length" in the OpenAI format, "MAX_TOKENS" from Gemini).
 */
export function isCutOff(finishReason: string | null | undefined): boolean {
  return /^(length|max_tokens)$/i.test(finishReason ?? "");
}
