/** FNV-1a 32-bit hash — fast, deterministic, good enough for seeding and jitter (not crypto). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random number in [0, 1) derived from a string. */
export function hashToUnit(text: string): number {
  return fnv1a32(text) / 0x1_0000_0000;
}
