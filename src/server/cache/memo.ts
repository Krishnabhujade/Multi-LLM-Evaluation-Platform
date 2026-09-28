/**
 * Memoizes an async loader for `ttlMs`. Concurrent callers share one in-flight request, and
 * failures resolve to `undefined` (callers fall back to static data) and are remembered for
 * `failureTtlMs` so an unreachable endpoint is not hit on every request.
 */
export function memoizeAsync<T>(
  load: () => Promise<T>,
  {
    ttlMs,
    failureTtlMs = 60_000,
    now = Date.now,
  }: { ttlMs: number; failureTtlMs?: number; now?: () => number },
): () => Promise<T | undefined> {
  let cached: { expiresAt: number; value: Promise<T | undefined> } | undefined;

  return () => {
    if (cached && cached.expiresAt > now()) return cached.value;

    const entry: { expiresAt: number; value: Promise<T | undefined> } = {
      expiresAt: now() + ttlMs,
      value: Promise.resolve(undefined),
    };
    entry.value = load().catch(() => {
      entry.expiresAt = now() + failureTtlMs;
      return undefined;
    });
    cached = entry;
    return entry.value;
  };
}
