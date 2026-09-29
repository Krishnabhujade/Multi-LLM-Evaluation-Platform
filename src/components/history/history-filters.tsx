"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS, TASK_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** One filter row above the list: category + prompt search, mirrored in the URL. */
export function HistoryFilters({ category, q }: { category?: string; q?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q ?? "");

  const navigate = (next: { category?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (next.category) params.set("category", next.category);
    if (next.q) params.set("q", next.q);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if ((q ?? "") === search.trim()) return;
    const timer = setTimeout(() => navigate({ category, q: search.trim() }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is recreated every render
  }, [search]);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", pending && "opacity-70")}>
      <div className="relative sm:w-80">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search prompts…"
          aria-label="Search prompts"
          className="pl-8"
        />
      </div>
      <Select
        value={category ?? "all"}
        onValueChange={(value) =>
          navigate({ category: value === "all" ? undefined : value, q: search.trim() })
        }
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Category">
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
      {(category || q) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            navigate({});
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
