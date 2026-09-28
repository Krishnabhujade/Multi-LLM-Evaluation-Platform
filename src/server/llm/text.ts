/**
 * Removes chain-of-thought blocks that some open models (e.g. Qwen, DeepSeek) emit inline as
 * `<think>…</think>`. Only the final answer is evaluated and displayed. An unterminated block at
 * the start means the model ran out of tokens while thinking, so nothing usable remains.
 */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*<think>[\s\S]*$/i, "");
}

/** Rough token estimate (~4 characters per token) for providers that report no usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
