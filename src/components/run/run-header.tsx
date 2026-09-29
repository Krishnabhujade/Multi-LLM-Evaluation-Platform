"use client";

import { ArrowLeft, CheckCircle2, EyeOff, Eye, Loader2, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DemoBadge } from "@/components/shared/model-name";
import { Badge } from "@/components/ui/badge";
import type { RunDetail } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function RunStatusPill({ status }: { status: RunDetail["status"] }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <CheckCircle2 className="size-4 text-status-good" aria-hidden /> Completed
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <XCircle className="size-4 text-status-critical" aria-hidden /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
      {status === "PENDING" ? "Queued" : "Running"}
    </span>
  );
}

export function RunHeader({ run }: { run: RunDetail }) {
  const [expanded, setExpanded] = useState(false);
  const long = run.prompt.length > 280 || run.prompt.split("\n").length > 4;

  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> New evaluation
        </Link>
        <RunStatusPill status={run.status} />
      </div>

      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Prompt
        </p>
        <p className={cn("text-base whitespace-pre-wrap", !expanded && long && "line-clamp-4")}>
          {run.prompt}
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {run.systemPrompt && (
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">System:</span> {run.systemPrompt}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{CATEGORY_LABELS[run.category]}</Badge>
        <Badge variant="secondary">
          {run.mode === "STANDARD" ? "Standard mode" : "Pairwise mode"}
        </Badge>
        <Badge variant="secondary">
          {run.blind ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {run.blind ? "Blind judging" : "Identity visible to judge"}
        </Badge>
        <Badge variant="secondary">
          {run.autoSelected && <Sparkles aria-hidden />}
          {run.responses.length} {run.autoSelected ? "auto-selected models" : "models"}
        </Badge>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          Judge: <span className="font-medium text-foreground">{run.judgeModel.displayName}</span>
          {run.judgeModel.isDemo && <DemoBadge />}
        </span>
        <span className="text-muted-foreground sm:ml-auto">{formatDateTime(run.createdAt)}</span>
      </div>
    </header>
  );
}
