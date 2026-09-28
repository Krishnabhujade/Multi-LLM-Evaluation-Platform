/** Display formatting shared by server and client components. */

const integer = new Intl.NumberFormat("en-US");

export function formatScore(score: number | null | undefined, digits = 2): string {
  return score === null || score === undefined ? "—" : score.toFixed(digits);
}

/** Criterion scores are usually whole or half points; avoid a noisy trailing ".0". */
export function formatCriterionScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(tokens: number | null | undefined): string {
  return tokens === null || tokens === undefined ? "—" : integer.format(tokens);
}

/**
 * Estimated cost: "N/A" when pricing is unknown, "$0.00" for free, 4 decimals for
 * sub-cent amounts (e.g. "$0.0021"), otherwise cents.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "N/A";
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** USD per 1M tokens with at least cent precision: 0.6 → "0.60", 0.075 → "0.075". */
function price(value: number): string {
  return value.toFixed(Math.max(2, Math.min(4, (String(value).split(".")[1] ?? "").length)));
}

/**
 * Input / output price per 1M tokens. `compact` drops the unit (for dense columns that label
 * the unit once in a header).
 */
export function formatPricePerMTok(
  pricing?: { inputPerMTok: number; outputPerMTok: number },
  { compact = false }: { compact?: boolean } = {},
): string {
  if (!pricing) return compact ? "—" : "Pricing N/A";
  if (pricing.inputPerMTok === 0 && pricing.outputPerMTok === 0) return "Free";
  const range = `$${price(pricing.inputPerMTok)} / $${price(pricing.outputPerMTok)}`;
  return compact ? range : `${range} per 1M`;
}

export function formatContextWindow(tokens?: number): string | undefined {
  if (!tokens) return undefined;
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M ctx`
    : `${Math.round(tokens / 1000)}K ctx`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  return formatLatency(Date.parse(endIso) - Date.parse(startIso));
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
