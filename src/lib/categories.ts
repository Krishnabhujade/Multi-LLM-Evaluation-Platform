import type { Capability } from "@/lib/capabilities";

/**
 * Task categories let users classify prompts so historical comparisons (history filters,
 * leaderboard) compare like with like. Kept in sync with the `TaskCategory` Prisma enum
 * (asserted by a unit test) and shared with client components.
 */
export const TASK_CATEGORIES = [
  "GENERAL_QA",
  "CODING",
  "MATHEMATICS",
  "REASONING",
  "SUMMARIZATION",
  "CREATIVE_WRITING",
  "RESEARCH",
  "DATA_ANALYSIS",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  GENERAL_QA: "General QA",
  CODING: "Coding",
  MATHEMATICS: "Mathematics",
  REASONING: "Reasoning",
  SUMMARIZATION: "Summarization",
  CREATIVE_WRITING: "Creative Writing",
  RESEARCH: "Research",
  DATA_ANALYSIS: "Data Analysis",
};

/**
 * Capabilities the auto-select router looks for, most important first. Deliberately simple —
 * capability tags from the model catalog, not a learned router.
 */
export const CATEGORY_CAPABILITIES: Record<TaskCategory, Capability[]> = {
  GENERAL_QA: ["general"],
  CODING: ["coding", "reasoning"],
  MATHEMATICS: ["math", "reasoning"],
  REASONING: ["reasoning", "math"],
  SUMMARIZATION: ["long-context", "general"],
  CREATIVE_WRITING: ["creative", "multilingual"],
  RESEARCH: ["reasoning", "long-context"],
  DATA_ANALYSIS: ["reasoning", "coding"],
};
