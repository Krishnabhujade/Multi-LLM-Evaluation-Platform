"use client";

import { AlertTriangle, Loader2, Sparkles, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DemoBadge } from "@/components/shared/model-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RunListPage, RunSummary } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDateTime, formatLatency, formatScore } from "@/lib/format";

function RunRow({ run }: { run: RunSummary }) {
  const failed = run.models.filter((model) => model.failed).length;
  return (
    <li>
      <Link
        href={`/evaluations/${run.id}`}
        className="block rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{CATEGORY_LABELS[run.category]}</Badge>
          {run.mode === "PAIRWISE" && <Badge variant="outline">Pairwise</Badge>}
          {run.autoSelected && (
            <Badge variant="outline">
              <Sparkles aria-hidden /> Auto-selected
            </Badge>
          )}
          <span>{formatDateTime(run.createdAt)}</span>
          {run.durationMs !== null && (
            <span className="tabular-nums">· {formatLatency(run.durationMs)}</span>
          )}
        </div>

        <p className="mt-2 line-clamp-2 font-medium">{run.prompt}</p>

        <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-muted-foreground">
            {run.models.length} models: {run.models.map((model) => model.displayName).join(" · ")}
            {run.models.some((model) => model.isDemo) && <DemoBadge className="ml-2" />}
            {failed > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs">
                <AlertTriangle className="size-3.5 text-status-warning" aria-hidden />
                {failed} failed
              </span>
            )}
          </p>
          {run.status === "COMPLETED" && run.winner ? (
            <p className="flex shrink-0 items-center gap-1.5">
              <Trophy className="size-4 text-viz-accent" aria-hidden />
              <span className="font-medium">{run.winner.displayName}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatScore(run.winner.overallScore)}
              </span>
            </p>
          ) : run.status === "FAILED" ? (
            <p className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <XCircle className="size-4 text-status-critical" aria-hidden /> Failed
            </p>
          ) : run.status === "COMPLETED" ? (
            <p className="shrink-0 text-muted-foreground">No winner</p>
          ) : (
            <p className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Running
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Paginated history list; "Load more" appends the next cursor page. */
export function HistoryList({ initial, query }: { initial: RunListPage; query: string }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      const response = await fetch(`/api/evaluations?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const page = (await response.json()) as RunListPage;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError("Couldn't load more evaluations. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
