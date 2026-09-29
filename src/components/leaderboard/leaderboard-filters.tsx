"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_LABELS, TASK_CATEGORIES } from "@/lib/categories";
import { LEADERBOARD_RANGES, type LeaderboardQuery } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

/** One filter row that scopes everything below it: date range first, then category and metric. */
export function LeaderboardFilters({
  query,
  criterionKeys,
}: {
  query: LeaderboardQuery;
  criterionKeys: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const update = (
    patch: Partial<Record<"range" | "category" | "sort" | "includeDemo", string | undefined>>,
  ) => {
    const next = {
      range: query.range,
      category: query.category,
      sort: query.sort,
      includeDemo: query.includeDemo ? "true" : undefined,
      ...patch,
    };
    const params = new URLSearchParams();
    if (next.range && next.range !== "30d") params.set("range", next.range);
    if (next.category) params.set("category", next.category);
    if (next.sort && next.sort !== "overall") params.set("sort", next.sort);
    if (next.includeDemo === "true") params.set("includeDemo", "true");
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
        pending && "opacity-70",
      )}
    >
      <Select value={query.range} onValueChange={(range) => update({ range })}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(LEADERBOARD_RANGES).map(([value, { label }]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={query.category ?? "all"}
        onValueChange={(value) => update({ category: value === "all" ? undefined : value })}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Task category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {TASK_CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={query.sort} onValueChange={(sort) => update({ sort })}>
        <SelectTrigger className="w-full sm:w-52" aria-label="Rank by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="overall">Rank by overall score</SelectItem>
          {criterionKeys.map((criterion) => (
            <SelectItem key={criterion.key} value={criterion.key}>
              Rank by {criterion.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 sm:ml-auto">
        <Switch
          id="include-demo"
          checked={query.includeDemo}
          onCheckedChange={(checked) => update({ includeDemo: checked ? "true" : undefined })}
        />
        <Label htmlFor="include-demo" className="text-sm font-normal text-muted-foreground">
          Include demo models
        </Label>
      </div>
    </div>
  );
}
