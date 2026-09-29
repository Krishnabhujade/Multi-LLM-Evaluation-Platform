import { z } from "zod";
import type { LeaderboardEntry } from "@/lib/api-types";
import { TASK_CATEGORIES } from "@/lib/categories";

/** Models with fewer scored responses than this are flagged as a low sample. */
export const MIN_LEADERBOARD_SAMPLE = 5;

export const LEADERBOARD_RANGES = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  all: { label: "All time", days: null },
} as const;

export type LeaderboardRange = keyof typeof LEADERBOARD_RANGES;

export const LeaderboardQuerySchema = z.object({
  category: z.enum(TASK_CATEGORIES).optional().catch(undefined),
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d").catch("30d"),
  /** "overall" or a criterion key to rank by. */
  sort: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,40}$/)
    .default("overall")
    .catch("overall"),
  includeDemo: z
    .enum(["true", "false"])
    .default("false")
    .catch("false")
    .transform((value) => value === "true"),
});

export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

export function parseLeaderboardQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): LeaderboardQuery {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return LeaderboardQuerySchema.parse({
    category: read("category"),
    range: read("range"),
    sort: read("sort"),
    includeDemo: read("includeDemo"),
  });
}

/** Start of the window for a range preset (null = all time). */
export function rangeStart(range: LeaderboardRange, now = new Date()): Date | null {
  const days = LEADERBOARD_RANGES[range].days;
  return days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Orders entries by the chosen metric (overall or a criterion), best first. Entries without a
 * value for the metric go last; ties break by sample size, then name — deterministic output.
 */
export function rankLeaderboard(entries: LeaderboardEntry[], sort: string): LeaderboardEntry[] {
  const metric = (entry: LeaderboardEntry) =>
    sort === "overall" ? entry.avgOverall : (entry.criteria[sort] ?? null);
  return [...entries].sort((a, b) => {
    const left = metric(a);
    const right = metric(b);
    if (left === null && right === null) return b.scored - a.scored;
    if (left === null) return 1;
    if (right === null) return -1;
    return (
      right - left || b.scored - a.scored || a.model.displayName.localeCompare(b.model.displayName)
    );
  });
}
