import { fnv1a32 } from "@/server/utils/hash";

/**
 * Seeded shuffling for position-bias mitigation. The seed is stored on the run, so the order in
 * which the judge saw responses — and which anonymous label each got — can be reproduced.
 */

/** mulberry32: a small, well-distributed PRNG seeded from a string. */
export function seededRandom(seed: string): () => number {
  let state = fnv1a32(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Fisher–Yates shuffle driven by the seeded PRNG; returns a new array. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function newShuffleSeed(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

/** "A", "B", … "Z", "AA", "AB", … */
export function anonLabel(position: number): string {
  let label = "";
  let n = position;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
