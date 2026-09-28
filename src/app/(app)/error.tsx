"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <AlertTriangle className="size-10 text-status-critical" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        The page failed to load.{" "}
        {error.digest && <span className="font-mono text-xs">({error.digest})</span>}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
