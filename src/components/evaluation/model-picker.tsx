"use client";

import { CheckCircle2, KeyRound } from "lucide-react";
import { DemoBadge } from "@/components/shared/model-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ModelListItem } from "@/lib/api-types";
import { formatContextWindow, formatPricePerMTok } from "@/lib/format";
import { isCandidateModel } from "@/lib/models";
import { PROVIDER_KEY_ENV } from "@/lib/providers";
import { cn } from "@/lib/utils";

export interface ProviderOption {
  id: string;
  name: string;
  configured: boolean;
  isDemo: boolean;
}

export function ModelPicker({
  models,
  providers,
  selected,
  onChange,
  max,
  error,
}: {
  models: ModelListItem[];
  providers: ProviderOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
  error?: string;
}) {
  const atLimit = selected.length >= max;
  const toggle = (ref: string, checked: boolean) =>
    onChange(checked ? [...selected, ref] : selected.filter((item) => item !== ref));

  // Demo models are only shown when the demo provider is enabled.
  const visibleProviders = providers.filter((provider) => !provider.isDemo || provider.configured);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">{selected.length}</span> of {max} selected
        </p>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Price per 1M tokens (in / out)
          </span>
          {selected.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {visibleProviders.map((provider) => {
          const providerModels = models.filter(
            (model) => model.providerId === provider.id && isCandidateModel(model),
          );
          return (
            <fieldset key={provider.id} className="min-w-0 p-3" disabled={!provider.configured}>
              <legend className="sr-only">{provider.name} models</legend>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {provider.name}
                  {provider.isDemo && <DemoBadge />}
                </span>
                {provider.configured ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-status-good" aria-hidden />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <KeyRound className="size-3.5" aria-hidden />
                    Set{" "}
                    <code className="font-mono">
                      {PROVIDER_KEY_ENV[provider.id] ?? "an API key"}
                    </code>{" "}
                    to enable
                  </span>
                )}
              </div>

              <ul className="grid grid-cols-1 gap-1">
                {providerModels.map((model) => {
                  const checked = selected.includes(model.ref);
                  const disabled = !model.available || (atLimit && !checked);
                  const id = `model-${model.ref}`;
                  return (
                    <li key={model.ref}>
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60",
                          checked && "bg-muted/60",
                          disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(value) => toggle(model.ref, value === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {model.displayName}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {model.modelId}
                          </span>
                        </span>
                        <span className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
                          {model.capabilities
                            .filter((capability) => capability !== "general")
                            .slice(0, 3)
                            .map((capability) => (
                              <Badge key={capability} variant="secondary" className="font-normal">
                                {capability}
                              </Badge>
                            ))}
                        </span>
                        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          <span className="block">
                            {formatPricePerMTok(model.pricing, { compact: true })}
                          </span>
                          {formatContextWindow(model.contextWindow) && (
                            <span className="block">
                              {formatContextWindow(model.contextWindow)}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
