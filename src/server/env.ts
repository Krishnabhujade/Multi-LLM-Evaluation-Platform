import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated with Zod.
 *
 * Every secret lives here and nowhere else: this module is `server-only`, so importing it from a
 * client component fails the build instead of leaking keys into the browser bundle.
 */

/** `.env` files commonly contain `KEY=` placeholders; treat those as unset. */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

/** Comma-separated list, e.g. `GROQ_MODELS=openai/gpt-oss-120b,qwen/qwen3.8-27b`. */
const csvList = (defaultValue: string[] = []) =>
  z.preprocess(emptyToUndefined, z.string().optional()).transform((value) =>
    value === undefined
      ? defaultValue
      : value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
  );

const booleanFlag = z
  .preprocess(
    (value) => (typeof value === "string" ? emptyToUndefined(value.trim().toLowerCase()) : value),
    z.enum(["true", "false", "1", "0"]).optional(),
  )
  .transform((value) => (value === undefined ? undefined : value === "true" || value === "1"));

const integer = (defaultValue: number, { min, max }: { min: number; max: number }) =>
  z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional())
    .transform((value) => value ?? defaultValue);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Public base URL of the deployment; sent to OpenRouter as the attribution referer. */
  APP_URL: optionalUrl,

  // Database (Neon): pooled URL at runtime, direct URL for migrations.
  DATABASE_URL: optionalString,
  DIRECT_DATABASE_URL: optionalString,
  TEST_DATABASE_URL: optionalString,
  /** Max connections in the runtime pool (optional; the pg default is 10). */
  DATABASE_POOL_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(50).optional(),
  ),

  // Redis is optional; an in-memory fallback is used when unset.
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  // Provider API keys. A provider is only offered when its key is present.
  GROQ_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  HUGGINGFACE_API_KEY: optionalString,

  // Optional per-provider model lists; when set they replace the built-in catalog defaults.
  GROQ_MODELS: csvList(),
  GEMINI_MODELS: csvList(),
  OPENROUTER_MODELS: csvList(),
  HUGGINGFACE_MODELS: csvList(),
  OPENROUTER_FREE_ONLY: booleanFlag,

  // LLM-as-a-judge. GPT-OSS 120B on Groq: a strong reasoning model that answers in seconds. The
  // fallbacks have their own rate-limit quotas (Groq limits are per model), and the first is fast
  // so a rate-limited primary costs seconds, not a long wait on a busy model.
  JUDGE_MODEL: z.preprocess(emptyToUndefined, z.string().default("groq:openai/gpt-oss-120b")),
  JUDGE_FALLBACK_MODELS: csvList(["groq:openai/gpt-oss-20b", "gemini:gemini-3.5-flash-lite"]),
  JUDGE_CONCURRENCY: integer(2, { min: 1, max: 16 }),
  /** Generous by default: thinking models spend part of the budget on reasoning tokens. */
  JUDGE_MAX_TOKENS: integer(3_000, { min: 256, max: 16_000 }),

  // Behaviour.
  ENABLE_DEMO_PROVIDER: booleanFlag,
  MODEL_TIMEOUT_MS: integer(45_000, { min: 1_000, max: 280_000 }),
  MODEL_MAX_RETRIES: integer(2, { min: 0, max: 5 }),
  RESPONSE_CACHE_TTL_SECONDS: integer(0, { min: 0, max: 7 * 24 * 60 * 60 }),
});

export type Env = ReturnType<typeof parseEnv>;

/** Pure parser (no caching) so tests can validate arbitrary inputs. */
export function parseEnv(source: Record<string, string | undefined> = process.env) {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    // Zod issues carry variable names and messages only — never the offending values.
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;
  return {
    ...env,
    OPENROUTER_FREE_ONLY: env.OPENROUTER_FREE_ONLY ?? true,
    // Demo models are a development aid; they must be opted into explicitly in production.
    ENABLE_DEMO_PROVIDER: env.ENABLE_DEMO_PROVIDER ?? env.NODE_ENV !== "production",
  };
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv();
  return cachedEnv;
}

/** Test hook: forget the memoized env after mutating `process.env`. */
export function resetEnvCache() {
  cachedEnv = undefined;
}
