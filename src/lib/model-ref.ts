/**
 * A model reference identifies a model across providers: `"<providerId>:<modelId>"`.
 *
 * Only the FIRST colon separates the two parts, because provider model ids may themselves contain
 * colons (OpenRouter `qwen/qwen3.8-27b:free`, Hugging Face `openai/gpt-oss-20b:fastest`).
 */
export interface ModelRef {
  providerId: string;
  modelId: string;
}

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function parseModelRef(ref: string): ModelRef {
  const separator = ref.indexOf(":");
  const providerId = separator === -1 ? "" : ref.slice(0, separator).trim();
  const modelId = separator === -1 ? "" : ref.slice(separator + 1).trim();

  if (!PROVIDER_ID_PATTERN.test(providerId) || modelId.length === 0) {
    throw new Error(`Invalid model reference "${ref}". Expected "<provider>:<model-id>".`);
  }
  return { providerId, modelId };
}

export function isValidModelRef(ref: string): boolean {
  try {
    parseModelRef(ref);
    return true;
  } catch {
    return false;
  }
}

export function formatModelRef({ providerId, modelId }: ModelRef): string {
  return `${providerId}:${modelId}`;
}
