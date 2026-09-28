/** Capability tags describe what a model is good at; the auto-select router matches them. */
export const CAPABILITIES = [
  "general",
  "coding",
  "reasoning",
  "math",
  "creative",
  "long-context",
  "fast",
  "multilingual",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
