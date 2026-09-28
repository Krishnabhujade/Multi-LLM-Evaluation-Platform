import type { Capability } from "@/lib/capabilities";

/**
 * Best-effort capability tags for models discovered at runtime (no curated catalog entry).
 * Heuristic by design — curated catalog entries always take precedence.
 */
export function inferCapabilities(id: string, name = "", contextLength?: number): Capability[] {
  const text = `${id} ${name}`.toLowerCase();
  const capabilities = new Set<Capability>(["general"]);

  if (/coder|codestral|devstral|\bcode\b/.test(text)) capabilities.add("coding");
  if (/math/.test(text)) capabilities.add("math");
  if (/reason|think|\br1\b|qwq|nemotron/.test(text)) capabilities.add("reasoning");
  if (/flash|lite|mini|nano|instant|small|\b[1-9](\.\d)?b\b/.test(text)) capabilities.add("fast");
  if (contextLength !== undefined && contextLength >= 200_000) capabilities.add("long-context");

  return [...capabilities];
}
