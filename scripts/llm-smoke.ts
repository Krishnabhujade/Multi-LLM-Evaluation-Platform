/**
 * Smoke test: call one real model through its adapter and the platform's resilience policy.
 *
 *   npm run llm:smoke -- groq:openai/gpt-oss-20b "Say hello in five words"
 *
 * Prints the response, token usage and per-attempt timings. Never prints API keys.
 */
import { getEnv } from "@/server/env";
import { invokeModel } from "@/server/llm/invoke";
import { getProviderRegistry } from "@/server/llm/registry";

const [ref, prompt = "In one sentence: what is 2 + 2, and why?"] = process.argv.slice(2);

if (!ref) {
  console.error('Usage: npm run llm:smoke -- <provider:model> ["prompt"]');
  process.exit(1);
}

const env = getEnv();
const registry = getProviderRegistry();

try {
  const { provider, model } = await registry.resolve(ref);
  console.log(`→ ${model.ref} (${provider.displayName})`);

  const outcome = await invokeModel(
    provider,
    {
      model: model.modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      maxTokens: 512,
    },
    { timeoutMs: env.MODEL_TIMEOUT_MS, maxRetries: env.MODEL_MAX_RETRIES },
    {
      onAttempt: ({ attempt, latencyMs, error }) =>
        console.log(
          `  attempt ${attempt}: ${error ? `${error.code} — ${error.message}` : "ok"} (${latencyMs} ms)`,
        ),
    },
  );

  if (outcome.ok) {
    const { content, usage, finishReason, resolvedModel } = outcome.result;
    console.log(`\n${content}\n`);
    console.log(
      `latency ${outcome.latencyMs} ms · attempts ${outcome.attempts} · finish ${finishReason ?? "?"} · ` +
        `tokens in/out/total ${usage?.inputTokens ?? "?"}/${usage?.outputTokens ?? "?"}/${usage?.totalTokens ?? "?"}` +
        (resolvedModel ? ` · served by ${resolvedModel}` : ""),
    );
  } else {
    console.error(`✗ ${outcome.error.code}: ${outcome.error.message}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
