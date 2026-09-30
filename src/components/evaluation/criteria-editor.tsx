"use client";

import { Info, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CriterionItem } from "@/lib/api-types";
import { BUILT_IN_CRITERIA } from "@/lib/criteria";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CriterionState {
  key: string;
  name: string;
  description: string;
  rubric?: string;
  builtIn: boolean;
  enabled: boolean;
  weight: number;
}

/** Every built-in at its default weight, then the user's custom criteria (off by default). */
export function defaultCriteria(custom: CriterionItem[] = []): CriterionState[] {
  return [
    ...BUILT_IN_CRITERIA.map((criterion) => ({
      key: criterion.key,
      name: criterion.name,
      description: criterion.description,
      builtIn: true,
      enabled: true,
      weight: criterion.defaultWeight,
    })),
    ...custom.map((criterion) => ({
      key: criterion.key,
      name: criterion.name,
      description: criterion.description,
      rubric: criterion.rubric ?? undefined,
      builtIn: false,
      enabled: false,
      weight: criterion.defaultWeight,
    })),
  ];
}

/** Criteria checklist with weight sliders; shares are shown because weights are normalized. */
export function CriteriaEditor({
  criteria,
  onChange,
  onReset,
  error,
}: {
  criteria: CriterionState[];
  onChange: (next: CriterionState[]) => void;
  onReset: () => void;
  error?: string;
}) {
  const total = criteria
    .filter((criterion) => criterion.enabled)
    .reduce((sum, criterion) => sum + criterion.weight, 0);
  const update = (key: string, patch: Partial<CriterionState>) =>
    onChange(
      criteria.map((criterion) => (criterion.key === key ? { ...criterion, ...patch } : criterion)),
    );

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {criteria.map((criterion) => {
          const share = criterion.enabled && total > 0 ? criterion.weight / total : 0;
          const id = `criterion-${criterion.key}`;
          return (
            <li key={criterion.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={criterion.enabled}
                  onCheckedChange={(value) => update(criterion.key, { enabled: value === true })}
                />
                <label htmlFor={id} className="min-w-0 truncate text-sm font-medium">
                  {criterion.name}
                </label>
                {!criterion.builtIn && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    Custom
                  </Badge>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`About ${criterion.name}`}
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{criterion.description}</TooltipContent>
                </Tooltip>
                <span
                  className={cn(
                    "ml-auto text-xs tabular-nums",
                    criterion.enabled ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {criterion.enabled ? formatPercent(share) : "off"}
                </span>
              </div>
              <Slider
                value={[criterion.weight]}
                min={0}
                max={50}
                step={5}
                disabled={!criterion.enabled}
                onValueChange={([value]) => update(criterion.key, { weight: value ?? 0 })}
                aria-label={`${criterion.name} weight`}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Weights are normalized to 100%.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw /> Reset
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
