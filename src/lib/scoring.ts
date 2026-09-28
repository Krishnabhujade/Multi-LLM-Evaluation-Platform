import type { ResponseDetail } from "@/lib/api-types";

/** Overall scores closer than this are reported as a statistical tie. */
export const TIE_EPSILON = 0.05;

/** Ranked (scored) responses, best first. */
export function rankedResponses(responses: ResponseDetail[]): ResponseDetail[] {
  return responses.filter((response) => response.rank !== null).sort((a, b) => a.rank! - b.rank!);
}

/** The runner-up when it is within TIE_EPSILON of the winner, else null. */
export function tiedRunnerUp(responses: ResponseDetail[]): ResponseDetail | null {
  const [first, second] = rankedResponses(responses);
  if (!first || !second || first.overallScore === null || second.overallScore === null) return null;
  return first.overallScore - second.overallScore < TIE_EPSILON ? second : null;
}
