/**
 * Synthetic content for the Demo provider (development data only). Responses are deterministic
 * for a given prompt so tests and demos are reproducible, and every response says it is fake.
 */
import type { ChatMessage } from "@/server/llm/types";
import { hashToUnit } from "@/server/utils/hash";

const DEMO_FOOTER = "_Synthetic response from a demo model (development data)._";

export function lastUserMessage(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function subjectOf(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  return firstLine.length > 90 ? `${firstLine.slice(0, 89)}…` : firstLine || "your question";
}

export function conciseAnswer(prompt: string): string {
  return [
    `**Short answer.** “${subjectOf(prompt)}” comes down to three ideas:`,
    "",
    "1. **Core idea** — state the central concept in a single sentence.",
    "2. **Example** — ground it in one concrete, familiar scenario.",
    "3. **Caveat** — flag the most common misconception.",
    "",
    DEMO_FOOTER,
  ].join("\n");
}

export function verboseAnswer(prompt: string): string {
  const subject = subjectOf(prompt);
  return [
    "## Overview",
    `Thank you for the question about “${subject}”. This is a broad topic, so let's go through it step by step, starting from the fundamentals and gradually building up to the finer details.`,
    "",
    "## Background",
    "Before answering directly, it helps to understand the background. Many people find this topic confusing at first, which is completely normal. The background matters because it frames everything that follows, and the background also explains why the details matter.",
    "",
    "## Key points",
    "- The first key point is the core concept, which underpins everything else.",
    "- The second key point builds on the first key point and adds nuance.",
    "- The third key point connects the previous key points to real-world practice.",
    "",
    "## Examples",
    "Consider a simple example. In this example, the core concept is applied to an everyday situation, which makes the idea easier to remember. Another example would show the same idea from a slightly different angle.",
    "",
    "## Caveats",
    "There are some caveats. Real situations are more complex, and exceptions exist. It is always worth double-checking the details for your specific case.",
    "",
    "## Conclusion",
    `In conclusion, as mentioned above, “${subject}” is best understood by starting with the core concept, looking at examples, and keeping the caveats in mind. I hope this detailed explanation helps!`,
    "",
    DEMO_FOOTER,
  ].join("\n");
}

export function balancedAnswer(prompt: string): string {
  return [
    `Here is a balanced answer to “${subjectOf(prompt)}”.`,
    "",
    "**What it is.** A one-paragraph explanation of the central idea in plain language.",
    "",
    "**How it works.** The mechanism in two or three steps, each building on the last.",
    "",
    "**Why it matters.** One practical consequence the reader can act on.",
    "",
    DEMO_FOOTER,
  ].join("\n");
}

/**
 * The synthetic judge reads the same prompt the real judge gets: criterion keys come from the
 * JSON template (`"<key>": { "reasoning": ... }`) and the candidate from `<candidate_response>`.
 * Scores are simple length/structure heuristics — clearly labelled as not a real judgement.
 */
export function syntheticJudgement(messages: ChatMessage[]): string {
  const text = messages.map((message) => message.content).join("\n");
  const keys = [
    ...new Set([...text.matchAll(/"([a-z][a-z0-9_]*)"\s*:\s*\{\s*"reasoning"/g)].map((m) => m[1]!)),
  ];
  const candidate = /<candidate_response>([\s\S]*?)<\/candidate_response>/.exec(text)?.[1] ?? "";
  const words = candidate.split(/\s+/).filter(Boolean).length;
  const structured = /(^|\n)\s*(#{1,3} |[-*] |\d+\. )/.test(candidate);

  const heuristics: Record<string, number> = {
    conciseness: words < 150 ? 9 : words < 350 ? 7 : 5,
    completeness: words < 60 ? 6 : words < 350 ? 8 : 8.5,
    clarity: structured ? 8.5 : 7,
  };

  const criteria = Object.fromEntries(
    keys.map((key) => {
      const jitter = hashToUnit(`${key}:${candidate}`) * 2 - 1; // [-1, 1)
      const base = heuristics[key] ?? 7.5;
      const score = Math.min(10, Math.max(0, Math.round((base + jitter) * 2) / 2));
      return [
        key,
        {
          reasoning: `Synthetic demo score for ${key.replaceAll("_", " ")} based on length (${words} words) and structure — not a real evaluation.`,
          score,
        },
      ];
    }),
  );

  return JSON.stringify({
    criteria,
    summary:
      "Synthetic demo evaluation: heuristic scores for local development, not a real judgement.",
    strengths: structured ? ["Uses visible structure"] : ["Direct"],
    weaknesses: words > 350 ? ["Long for the request"] : ["Generic content"],
  });
}
