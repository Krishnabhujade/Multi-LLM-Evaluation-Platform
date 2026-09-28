import type { Capability } from "@/lib/capabilities";

/**
 * Default model catalog — the single place where model IDs live.
 *
 * Nothing else in the codebase hardcodes a model ID. At runtime the registry applies env
 * overrides (e.g. `GROQ_MODELS=a,b` replaces the Groq list) and, for OpenRouter / Hugging Face,
 * live discovery. This module is pure data (no secrets), so the seed script can import it.
 *
 * IDs verified against provider docs on 2026-09-28. Pricing is the provider's paid list price in
 * USD per 1M tokens and is only filled in where verified; missing pricing is shown as "N/A".
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface CatalogModel {
  modelId: string;
  displayName: string;
  capabilities: Capability[];
  contextWindow?: number;
  pricing?: ModelPricing;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  /** Development-only provider; never enabled in production unless explicitly opted in. */
  isDemo: boolean;
  models: CatalogModel[];
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "groq",
    name: "Groq",
    isDemo: false,
    models: [
      {
        modelId: "llama-3.3-70b-versatile",
        displayName: "Llama 3.3 70B Versatile",
        capabilities: ["general", "creative", "multilingual"],
        contextWindow: 131_072,
      },
      {
        modelId: "openai/gpt-oss-120b",
        displayName: "GPT-OSS 120B",
        capabilities: ["general", "reasoning", "coding", "math"],
        contextWindow: 131_072,
        pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
      },
      {
        modelId: "llama-3.1-8b-instant",
        displayName: "Llama 3.1 8B Instant",
        capabilities: ["general", "fast"],
        contextWindow: 131_072,
      },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    isDemo: false,
    models: [
      {
        modelId: "gemini-3.8-flash",
        displayName: "Gemini 3.8 Flash",
        capabilities: ["general", "reasoning", "coding", "math", "creative", "long-context"],
        pricing: { inputPerMTok: 0.75, outputPerMTok: 3.75 },
      },
      {
        modelId: "gemini-3.5-flash-lite",
        displayName: "Gemini 3.5 Flash-Lite",
        capabilities: ["general", "fast", "long-context"],
        pricing: { inputPerMTok: 0.3, outputPerMTok: 2.5 },
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    isDemo: false,
    // Free models rotate frequently; the provider also discovers the live `:free` list.
    models: [
      {
        modelId: "qwen/qwen3.8-27b:free",
        displayName: "Qwen3.8 27B (free)",
        capabilities: ["general", "coding", "reasoning"],
        contextWindow: 262_144,
        pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      },
      {
        modelId: "google/gemma-4-31b-it:free",
        displayName: "Gemma 4 31B (free)",
        capabilities: ["general", "creative", "multilingual"],
        contextWindow: 262_144,
        pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    isDemo: false,
    models: [
      {
        modelId: "openai/gpt-oss-20b:fastest",
        displayName: "GPT-OSS 20B (HF router)",
        capabilities: ["general", "reasoning", "coding", "fast"],
        contextWindow: 131_072,
      },
    ],
  },
  {
    id: "demo",
    name: "Demo (development data)",
    isDemo: true,
    // Deterministic fake models so the full pipeline runs with zero API keys.
    models: [
      {
        modelId: "demo-concise",
        displayName: "Demo · Concise",
        capabilities: ["general", "fast"],
      },
      {
        modelId: "demo-verbose",
        displayName: "Demo · Verbose",
        capabilities: ["general", "creative"],
      },
      {
        modelId: "demo-flaky",
        displayName: "Demo · Flaky (429 then OK)",
        capabilities: ["general"],
      },
      {
        modelId: "demo-slow",
        displayName: "Demo · Slow (times out)",
        capabilities: ["general"],
      },
      {
        modelId: "demo-judge",
        displayName: "Demo · Synthetic judge",
        capabilities: ["general"],
      },
    ],
  },
];

export function findCatalogProvider(providerId: string) {
  return PROVIDER_CATALOG.find((provider) => provider.id === providerId);
}
