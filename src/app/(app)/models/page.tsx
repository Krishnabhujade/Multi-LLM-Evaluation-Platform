import { CheckCircle2, Gavel, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoBadge } from "@/components/shared/model-name";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatContextWindow, formatPricePerMTok } from "@/lib/format";
import { PROVIDER_KEY_ENV } from "@/lib/providers";
import { getEnv } from "@/server/env";
import { getProviderRegistry } from "@/server/llm/registry";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage() {
  await connection();
  const env = getEnv();
  const registry = getProviderRegistry();
  const [models, providers] = [
    await registry.listModels({ includeUnavailable: true }),
    registry.summaries(),
  ];
  const availableRefs = new Set(
    models.filter((model) => model.available).map((model) => model.ref),
  );
  const judgeChain = [env.JUDGE_MODEL, ...env.JUDGE_FALLBACK_MODELS];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Providers &amp; models</h1>
        <p className="max-w-2xl text-muted-foreground">
          Providers are enabled by setting their API key on the server. Keys are never sent to the
          browser — this page only shows whether one is configured.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="size-4" aria-hidden /> Judge
          </CardTitle>
          <CardDescription>
            Tried in order; the first available model judges. A judge that fails or returns invalid
            output hands over to the next one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {judgeChain.map((ref, index) => (
              <li key={ref} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground">→</span>}
                <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs">
                  {availableRefs.has(ref) ? (
                    <CheckCircle2 className="size-3.5 text-status-good" aria-label="available" />
                  ) : (
                    <KeyRound
                      className="size-3.5 text-muted-foreground"
                      aria-label="not configured"
                    />
                  )}
                  {ref}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {providers
          .filter((provider) => !provider.isDemo || provider.configured)
          .map((provider) => {
            const providerModels = models.filter((model) => model.providerId === provider.id);
            return (
              <Card key={provider.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {provider.name}
                      {provider.isDemo && <DemoBadge />}
                    </span>
                    {provider.configured ? (
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        <CheckCircle2 className="size-3.5 text-status-good" aria-hidden /> Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        <KeyRound className="size-3.5" aria-hidden /> Not configured
                      </span>
                    )}
                  </CardTitle>
                  {!provider.configured && (
                    <CardDescription>
                      Set <code className="font-mono">{PROVIDER_KEY_ENV[provider.id]}</code> in{" "}
                      <code className="font-mono">.env</code> to enable.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {providerModels.map((model) => (
                      <li key={model.ref} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{model.displayName}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {model.modelId}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {model.capabilities.map((capability) => (
                              <Badge key={capability} variant="secondary" className="font-normal">
                                {capability}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p>{formatPricePerMTok(model.pricing)}</p>
                          <p>{formatContextWindow(model.contextWindow) ?? ""}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
