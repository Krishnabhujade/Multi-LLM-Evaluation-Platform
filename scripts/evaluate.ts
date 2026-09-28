/**
 * Runs a complete evaluation from the terminal — the same pipeline the web app uses, persisted
 * to the database — and prints the ranking.
 *
 *   npm run eval -- "Explain how DNS works" groq:llama-3.3-70b-versatile gemini:gemini-3.8-flash
 *   npm run eval -- "Explain how DNS works"          (defaults to the demo models)
 */
import { CreateEvaluationSchema } from "@/lib/evaluation-request";
import { LLM_ERROR_LABELS, isLLMErrorCode } from "@/lib/llm-errors";
import { claimRun, executeRun } from "@/server/evaluation/orchestrator";
import { createEvaluation, getEvaluation, getOrchestratorDeps } from "@/server/evaluation/service";

const [prompt, ...models] = process.argv.slice(2);
if (!prompt) {
  console.error('Usage: npm run eval -- "<prompt>" [provider:model ...]');
  process.exit(1);
}

const input = CreateEvaluationSchema.parse({
  prompt,
  models:
    models.length > 0 ? models : ["demo:demo-concise", "demo:demo-verbose", "demo:demo-flaky"],
});

const { id } = await createEvaluation(input, { requestId: `cli-${Date.now()}` });
console.log(`Evaluation ${id}`);

const deps = getOrchestratorDeps();
await claimRun(deps.store, id);
await executeRun(id, deps, (event) => {
  switch (event.type) {
    case "run.started":
      console.log(`Calling ${event.candidates.length} models (judge: ${event.judgeModelRef})…`);
      break;
    case "model.completed":
      console.log(`  ✓ ${event.responseId} in ${event.latencyMs} ms`);
      break;
    case "model.failed":
      console.log(`  ✗ ${event.responseId}: ${event.errorCode} — ${event.message}`);
      break;
    case "judging.started":
      console.log(`Evaluating ${event.total} responses…`);
      break;
    case "run.failed":
      console.log(`Run failed: ${event.message}`);
      break;
  }
});

const run = await getEvaluation(id);
if (!run) process.exit(1);

console.log(`\nStatus: ${run.status}${run.error ? ` (${run.error})` : ""}\n`);
const rows = [...run.responses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
for (const response of rows) {
  const status =
    response.status === "FAILED"
      ? `⚠ ${isLLMErrorCode(response.errorCode) ? LLM_ERROR_LABELS[response.errorCode] : response.errorCode}`
      : response.overallScore !== null
        ? `${response.overallScore.toFixed(2)}/10`
        : "not scored";
  const crown = response.id === run.winnerResponseId ? " 🏆" : "";
  console.log(
    `${String(response.rank ?? "-").padStart(2)}. ${response.model.ref.padEnd(45)} ${status.padEnd(18)} ${
      response.latencyMs !== null ? `${(response.latencyMs / 1000).toFixed(1)}s` : ""
    }${crown}`,
  );
}
process.exit(0);
