import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  KeyRound,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import type { ResponseStatus as Status } from "@/lib/api-types";
import { LLM_ERROR_LABELS, isLLMErrorCode } from "@/lib/llm-errors";
import { cn } from "@/lib/utils";

/** Transient failures (worth retrying later) read as warnings; the rest as critical. */
const TRANSIENT = new Set(["TIMEOUT", "RATE_LIMITED", "UNAVAILABLE", "NETWORK", "ABORTED"]);

function ErrorIcon({ code }: { code: string | null }) {
  const className = cn(
    "size-3.5",
    TRANSIENT.has(code ?? "") ? "text-status-warning" : "text-status-critical",
  );
  switch (code) {
    case "TIMEOUT":
      return <Clock className={className} aria-hidden />;
    case "RATE_LIMITED":
      return <Gauge className={className} aria-hidden />;
    case "AUTH":
      return <KeyRound className={className} aria-hidden />;
    case "CONTENT_FILTERED":
      return <ShieldAlert className={className} aria-hidden />;
    default:
      return <AlertTriangle className={className} aria-hidden />;
  }
}

export function errorLabel(code: string | null): string {
  return isLLMErrorCode(code) ? LLM_ERROR_LABELS[code] : "Failed";
}

/** Status is never conveyed by color alone: every state has an icon and a text label. */
export function ResponseStatusLabel({
  status,
  errorCode,
  className,
}: {
  status: Status;
  errorCode: string | null;
  className?: string;
}) {
  const base = cn("inline-flex items-center gap-1.5 text-xs font-medium", className);

  if (status === "PENDING") {
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Calling…
      </span>
    );
  }
  if (status === "SUCCESS") {
    return (
      <span className={base}>
        <CheckCircle2 className="size-3.5 text-status-good" aria-hidden />
        Completed
      </span>
    );
  }

  return (
    <span className={base}>
      <ErrorIcon code={errorCode} />
      {errorLabel(errorCode)}
    </span>
  );
}
