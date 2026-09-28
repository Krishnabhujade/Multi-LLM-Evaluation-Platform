"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "New evaluation", match: (path: string) => path === "/" },
  { href: "/models", label: "Models", match: (path: string) => path.startsWith("/models") },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
            <Scale className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">Multi-LLM Eval</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
