"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  {
    href: "/",
    label: "New evaluation",
    short: "New",
    match: (path: string) => path === "/" || path.startsWith("/evaluations"),
  },
  { href: "/history", label: "History", match: (path: string) => path.startsWith("/history") },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    match: (path: string) => path.startsWith("/leaderboard"),
  },
  { href: "/criteria", label: "Criteria", match: (path: string) => path.startsWith("/criteria") },
  { href: "/models", label: "Models", match: (path: string) => path.startsWith("/models") },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
            <Scale className="size-4" aria-hidden />
          </span>
          <span className="hidden md:inline">Multi-LLM Eval</span>
        </Link>
        <nav
          aria-label="Main"
          className="-mx-1 flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto px-1 text-sm"
        >
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-3",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                {item.short ? (
                  <>
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
