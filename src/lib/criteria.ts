/**
 * Built-in evaluation criteria. Each criterion is scored 0–10 by the judge; `defaultWeight` is in
 * percentage points and is normalized at scoring time, so weights need not sum to exactly 100.
 *
 * `key` is the stable identifier used in the judge's JSON output and in stored scores — never
 * rename a key once evaluations exist.
 */
export interface CriterionDefinition {
  key: string;
  name: string;
  description: string;
  /** What distinguishes low, middle and high scores for this criterion. */
  rubric: string;
  defaultWeight: number;
}

export const BUILT_IN_CRITERIA: readonly CriterionDefinition[] = [
  {
    key: "accuracy",
    name: "Accuracy",
    description:
      "Factual correctness of every claim, calculation and code statement in the response.",
    rubric:
      "9-10: no errors; claims are precise and verifiable. 7-8: minor imprecision that does not mislead. 4-6: at least one material error or unsupported claim. 0-3: major factual errors or fabricated information.",
    defaultWeight: 25,
  },
  {
    key: "relevance",
    name: "Relevance",
    description:
      "How directly the response addresses what the user actually asked, without drifting into unrelated material.",
    rubric:
      "9-10: every part serves the request. 7-8: mostly on target with small digressions. 4-6: partially answers or pads with tangents. 0-3: largely off-topic.",
    defaultWeight: 20,
  },
  {
    key: "clarity",
    name: "Clarity",
    description:
      "How easy the response is to understand: structure, wording, formatting and a level appropriate for the audience.",
    rubric:
      "9-10: well organized and immediately understandable. 7-8: clear with minor awkwardness. 4-6: hard to follow in places. 0-3: confusing or disorganized.",
    defaultWeight: 15,
  },
  {
    key: "completeness",
    name: "Completeness",
    description: "Whether the response covers every part of the request with sufficient depth.",
    rubric:
      "9-10: all parts covered with appropriate depth. 7-8: a minor aspect is thin or missing. 4-6: a significant part is missing. 0-3: most of the request is unaddressed.",
    defaultWeight: 15,
  },
  {
    key: "conciseness",
    name: "Conciseness",
    description:
      "Whether the response avoids padding, repetition and unnecessary detail. A short answer that fully satisfies the request deserves a high score.",
    rubric:
      "9-10: no wasted words for the depth required. 7-8: slightly wordy. 4-6: noticeable repetition or filler. 0-3: dominated by padding or repetition.",
    defaultWeight: 10,
  },
  {
    key: "instruction_following",
    name: "Instruction Following",
    description:
      "Adherence to explicit constraints in the prompt and system prompt, such as format, length, style, audience and language.",
    rubric:
      "9-10: every explicit instruction is honoured. 7-8: a minor instruction is bent. 4-6: an important instruction is ignored. 0-3: instructions are largely ignored.",
    defaultWeight: 15,
  },
];
