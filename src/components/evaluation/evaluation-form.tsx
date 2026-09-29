"use client";

import { ChevronDown, CornerDownLeft, Loader2, Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  CriteriaEditor,
  defaultCriteria,
  type CriterionState,
} from "@/components/evaluation/criteria-editor";
import { ModelPicker, type ProviderOption } from "@/components/evaluation/model-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ModelListItem } from "@/lib/api-types";
import {
  CATEGORY_CAPABILITIES,
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  type TaskCategory,
} from "@/lib/categories";
import {
  CreateEvaluationSchema,
  MAX_MODELS_PER_RUN,
  type CreateEvaluationInput,
} from "@/lib/evaluation-request";
import { isCandidateModel, selectModelsForCategory } from "@/lib/models";
import { cn } from "@/lib/utils";

const EXAMPLES: Array<{ label: string; prompt: string; category: TaskCategory }> = [
  {
    label: "Explain blockchain",
    prompt: "Explain how blockchain works to a beginner.",
    category: "GENERAL_QA",
  },
  {
    label: "Merge intervals",
    prompt:
      "Write a Python function that merges overlapping intervals. Include type hints, a docstring and three unit tests.",
    category: "CODING",
  },
  {
    label: "Bat and ball",
    prompt:
      "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Explain your reasoning step by step.",
    category: "REASONING",
  },
  {
    label: "TCP vs UDP",
    prompt: "Summarize the key differences between TCP and UDP in exactly five bullet points.",
    category: "SUMMARIZATION",
  },
];

const MAX_TOKEN_OPTIONS = [256, 512, 1024, 2048, 4096];

/** Pre-select one model per connected provider (up to 4); fall back to demo models. */
function defaultSelection(models: ModelListItem[]): string[] {
  const available = models.filter((model) => model.available && isCandidateModel(model));
  const real = available.filter((model) => !model.isDemo);
  if (real.length > 0) {
    const picks = new Map<string, string>(); // providerId → first model ref
    for (const model of real) {
      if (!picks.has(model.providerId)) picks.set(model.providerId, model.ref);
    }
    return [...picks.values()].slice(0, 4);
  }
  return available
    .filter((model) => ["demo-concise", "demo-verbose", "demo-flaky"].includes(model.modelId))
    .map((model) => model.ref);
}

type FieldErrors = Partial<Record<"prompt" | "models" | "criteria" | "form", string>>;

export function EvaluationForm({
  models,
  providers,
  defaultJudgeRef,
  unreliableRefs = [],
}: {
  models: ModelListItem[];
  providers: ProviderOption[];
  defaultJudgeRef: string | null;
  /** Models failing often in the last 24 h; auto-select avoids them. */
  unreliableRefs?: string[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [category, setCategory] = useState<TaskCategory>("GENERAL_QA");
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(models));
  const [autoSelect, setAutoSelect] = useState(false);
  const [criteria, setCriteria] = useState<CriterionState[]>(defaultCriteria);
  const [blind, setBlind] = useState(true);
  const [judgeRef, setJudgeRef] = useState(defaultJudgeRef ?? "");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const judgeOptions = useMemo(() => models.filter((model) => model.available), [models]);
  // Same pure router the server runs, so the preview matches what will be evaluated.
  const autoPicked = useMemo(
    () =>
      selectModelsForCategory(category, models, {
        judgeRef: judgeRef || null,
        avoid: unreliableRefs,
      }),
    [category, models, judgeRef, unreliableRefs],
  );
  const skippedUnreliable = models.filter(
    (model) => model.available && unreliableRefs.includes(model.ref),
  );
  const effectiveModels = autoSelect ? autoPicked.map((model) => model.ref) : selected;
  const judgeIsCandidate = judgeRef !== "" && effectiveModels.includes(judgeRef);
  const judgeName = judgeOptions.find((model) => model.ref === judgeRef)?.displayName;
  const enabledCriteria = criteria.filter((criterion) => criterion.enabled).length;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;

    const body: CreateEvaluationInput = {
      prompt,
      systemPrompt: systemPrompt.trim() || undefined,
      category,
      models: autoSelect ? [] : selected,
      autoSelect,
      temperature,
      maxTokens,
      mode: "STANDARD",
      blind,
      criteria: criteria
        .filter((criterion) => criterion.enabled)
        .map((criterion) => ({ key: criterion.key, weight: criterion.weight })),
      judgeModel: judgeRef && judgeRef !== defaultJudgeRef ? judgeRef : undefined,
    };

    const check = CreateEvaluationSchema.safeParse(body);
    if (!check.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0];
        if (
          (field === "prompt" || field === "models" || field === "criteria") &&
          !fieldErrors[field]
        ) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        { id: string } | { error: { message: string } } | null;
      if (!response.ok || !payload || !("id" in payload)) {
        const message =
          payload && "error" in payload ? payload.error.message : "Could not start the evaluation.";
        setErrors({ form: message });
        toast.error(message);
        setSubmitting(false);
        return;
      }
      router.push(`/evaluations/${payload.id}`);
    } catch {
      toast.error("Network error — please try again.");
      setSubmitting(false);
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Prompt</CardTitle>
            <CardDescription>The same prompt is sent to every selected model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="prompt" className="sr-only">
              Prompt
            </Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Explain how blockchain works to a beginner."
              rows={6}
              aria-invalid={Boolean(errors.prompt)}
              aria-describedby={errors.prompt ? "prompt-error" : undefined}
              className="min-h-36 resize-y text-sm"
            />
            {errors.prompt && (
              <p id="prompt-error" className="text-sm text-destructive" role="alert">
                {errors.prompt}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden /> Try:
              </span>
              {EXAMPLES.map((example) => (
                <Button
                  key={example.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setPrompt(example.prompt);
                    setCategory(example.category);
                  }}
                >
                  {example.label}
                </Button>
              ))}
            </div>
            <Collapsible>
              <CollapsibleTrigger className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                System prompt <span className="text-xs">(optional)</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Label htmlFor="system-prompt" className="sr-only">
                  System prompt
                </Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="You are a patient teacher. Keep answers under 200 words."
                  rows={3}
                  className="text-sm"
                />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
            <CardDescription>Selected models are called in parallel.</CardDescription>
            <CardAction className="flex items-center gap-2">
              <Label htmlFor="auto-select" className="text-sm font-normal text-muted-foreground">
                Auto-select
              </Label>
              <Switch id="auto-select" checked={autoSelect} onCheckedChange={setAutoSelect} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {autoSelect ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Picked for{" "}
                  <span className="font-medium text-foreground">{CATEGORY_LABELS[category]}</span>{" "}
                  from the capability tags of available models (
                  {CATEGORY_CAPABILITIES[category].join(", ")}), one per provider where possible.
                  The judge is left out so it never grades itself.
                </p>
                {skippedUnreliable.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Skipped for failing often in the last 24 h:{" "}
                    {skippedUnreliable.map((model) => model.displayName).join(", ")}.
                  </p>
                )}
                {autoPicked.length > 0 ? (
                  <ul className="divide-y rounded-lg border">
                    {autoPicked.map((model) => (
                      <li
                        key={model.ref}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {model.displayName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {model.providerName}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {model.capabilities
                            .filter((capability) =>
                              CATEGORY_CAPABILITIES[category].includes(capability),
                            )
                            .map((capability) => (
                              <Badge key={capability} variant="secondary" className="font-normal">
                                {capability}
                              </Badge>
                            ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-destructive">
                    No models are available to auto-select.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelected(autoPicked.map((model) => model.ref));
                    setAutoSelect(false);
                  }}
                >
                  Customize this selection
                </Button>
              </div>
            ) : (
              <ModelPicker
                models={models}
                providers={providers}
                selected={selected}
                onChange={setSelected}
                max={MAX_MODELS_PER_RUN}
                error={errors.models}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="category">Task category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as TaskCategory)}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <div
                className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm"
                role="radiogroup"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked="true"
                  className="rounded-md bg-background px-2 py-1 font-medium shadow-sm"
                >
                  Standard
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked="false"
                  disabled
                  className="flex items-center justify-center gap-1 rounded-md px-2 py-1 text-muted-foreground"
                >
                  Pairwise{" "}
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    Soon
                  </Badge>
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="blind">Blind judging</Label>
                <p className="text-xs text-muted-foreground">
                  The judge sees “Response A/B/C”, never model names.
                </p>
              </div>
              <Switch id="blind" checked={blind} onCheckedChange={setBlind} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="judge">Judge model</Label>
              <Select
                value={judgeRef}
                onValueChange={setJudgeRef}
                disabled={judgeOptions.length === 0}
              >
                <SelectTrigger id="judge" className="w-full">
                  <SelectValue placeholder="No judge available" />
                </SelectTrigger>
                <SelectContent>
                  {judgeOptions.map((model) => (
                    <SelectItem key={model.ref} value={model.ref}>
                      {model.displayName}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {model.ref === defaultJudgeRef ? "· default" : `· ${model.providerName}`}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {judgeIsCandidate && (
                <p className="text-xs text-muted-foreground">
                  This model is also a candidate — LLM judges can favor their own answers.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Criteria &amp; weights</CardTitle>
            <CardDescription>Each criterion is scored 0–10.</CardDescription>
          </CardHeader>
          <CardContent>
            <CriteriaEditor criteria={criteria} onChange={setCriteria} error={errors.criteria} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature">Temperature</Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {temperature.toFixed(1)}
                </span>
              </div>
              <Slider
                id="temperature"
                value={[temperature]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([value]) => setTemperature(value ?? 0.7)}
                aria-label="Temperature"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-tokens">Max output tokens</Label>
              <Select
                value={String(maxTokens)}
                onValueChange={(value) => setMaxTokens(Number(value))}
              >
                <SelectTrigger id="max-tokens" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_TOKEN_OPTIONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* Action bar: spans both columns and stays visible while scrolling. */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {errors.form ? (
              <span className="text-destructive" role="alert">
                {errors.form}
              </span>
            ) : (
              <>
                <span className="font-medium text-foreground">{effectiveModels.length}</span>{" "}
                {autoSelect ? "auto-selected " : ""}models ·{" "}
                <span className="font-medium text-foreground">{enabledCriteria}</span> criteria ·
                judged by <span className="font-medium text-foreground">{judgeName ?? "—"}</span>
                {blind ? " (blind)" : ""}
              </>
            )}
          </p>
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Play />}
            {submitting ? "Starting…" : "Run evaluation"}
            <kbd
              className={cn(
                "ml-2 hidden items-center gap-0.5 rounded border border-primary-foreground/30 px-1 font-mono text-[10px] sm:inline-flex",
                submitting && "sm:hidden",
              )}
            >
              Ctrl <CornerDownLeft className="size-3" />
            </kbd>
          </Button>
        </div>
      </div>
    </form>
  );
}
