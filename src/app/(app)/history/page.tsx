import { History as HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HistoryFilters } from "@/components/history/history-filters";
import { HistoryList } from "@/components/history/history-list";
import { DatabaseSetupNotice } from "@/components/shared/setup-notice";
import { Button } from "@/components/ui/button";
import { parseHistoryQuery } from "@/lib/history-query";
import { listRuns } from "@/server/db/history";
import { DatabaseNotConfiguredError, getPrisma } from "@/server/db/prisma";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const query = parseHistoryQuery(await searchParams);
  let page;
  try {
    page = await listRuns(getPrisma(), { ...query, cursor: undefined });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) return <DatabaseSetupNotice />;
    throw error;
  }

  const filterQuery = new URLSearchParams({
    ...(query.category && { category: query.category }),
    ...(query.q && { q: query.q }),
  }).toString();
  const filtered = Boolean(query.category || query.q);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation history</h1>
        <p className="text-muted-foreground">
          Every evaluation is stored so it can be revisited and compared.
        </p>
      </div>

      <HistoryFilters category={query.category} q={query.q} />

      {page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <HistoryIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">
            {filtered ? "No evaluations match these filters" : "No evaluations yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {filtered
              ? "Try a different search or category."
              : "Run your first evaluation to compare models on a prompt."}
          </p>
          {!filtered && (
            <Button asChild>
              <Link href="/">New evaluation</Link>
            </Button>
          )}
        </div>
      ) : (
        // Keyed by the filters so a new filter resets the appended pages.
        <HistoryList key={filterQuery} initial={page} query={filterQuery} />
      )}
    </div>
  );
}
