import { Scissors } from "lucide-react";

/** Shown where a truncated answer ends, so a cut-off answer is not mistaken for a weak one. */
export function CutOffNotice() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Scissors className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Cut off at the output-token limit, so this answer may be incomplete (the judge scored the
        same text). Raise <span className="font-medium text-foreground">Max output tokens</span>{" "}
        under Generation for longer answers.
      </span>
    </p>
  );
}
