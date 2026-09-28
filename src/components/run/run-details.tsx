import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunDetail } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Everything needed to understand (and reproduce) how this run was evaluated. */
export function RunDetails({ run }: { run: RunDetail }) {
  const totalWeight = run.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Category">{CATEGORY_LABELS[run.category]}</Row>
            <Row label="Mode">
              {run.mode === "STANDARD" ? "Standard (pointwise judge)" : "Pairwise"}
            </Row>
            <Row label="Blind judging">
              {run.blind ? "Yes — model identities hidden from the judge" : "No"}
            </Row>
            <Row label="Judge model">
              <span className="font-mono text-xs">{run.judgeModel.ref}</span>
            </Row>
            <Row label="Temperature">{run.temperature}</Row>
            <Row label="Max output tokens">{run.maxTokens.toLocaleString()}</Row>
            <Row label="Created">{formatDateTime(run.createdAt)}</Row>
            <Row label="Duration">{formatDuration(run.startedAt, run.completedAt)}</Row>
            <Row label="Run ID">
              <span className="font-mono text-xs">{run.id}</span>
            </Row>
            {run.requestId && (
              <Row label="Request ID">
                <span className="font-mono text-xs">{run.requestId}</span>
              </Row>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criteria &amp; weights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {run.criteria.map((criterion) => (
              <li key={criterion.key} className="space-y-1 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{criterion.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatPercent(totalWeight > 0 ? criterion.weight / totalWeight : 0)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{criterion.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Overall = Σ(weight × score) / Σ(weights), computed by the platform from the judge&apos;s
            per-criterion scores.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
