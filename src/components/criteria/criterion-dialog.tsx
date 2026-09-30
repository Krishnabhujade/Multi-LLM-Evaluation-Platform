"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { CriterionItem } from "@/lib/api-types";
import { CriterionFieldsSchema, criterionKeyFromName } from "@/lib/criteria";

type Field = "name" | "description" | "rubric" | "defaultWeight";
type FieldErrors = Partial<Record<Field | "form", string>>;

const DEFAULT_WEIGHT = 10;

/**
 * Create or edit a custom criterion. The key is derived from the name on creation and shown as a
 * preview; it is fixed afterwards because stored scores reference it.
 */
export function CriterionDialog({
  open,
  onOpenChange,
  criterion,
  takenKeys,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The criterion being edited; omitted to create one. */
  criterion?: CriterionItem;
  takenKeys: string[];
  onSaved: (criterion: CriterionItem) => void;
}) {
  const editing = criterion !== undefined;
  const [name, setName] = useState(criterion?.name ?? "");
  const [description, setDescription] = useState(criterion?.description ?? "");
  const [rubric, setRubric] = useState(criterion?.rubric ?? "");
  const [weight, setWeight] = useState(criterion?.defaultWeight ?? DEFAULT_WEIGHT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const keyPreview = editing
    ? criterion.key
    : name.trim()
      ? criterionKeyFromName(name, takenKeys)
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const fields = { name, description, rubric, defaultWeight: weight };
    const check = CriterionFieldsSchema.safeParse(fields);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0] as Field;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/criteria/${criterion.id}` : "/api/criteria", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        // Send the raw rubric on edit so clearing it is saved.
        body: JSON.stringify(editing ? { ...check.data, rubric: rubric.trim() } : check.data),
      });
      const payload = (await response.json().catch(() => null)) as
        CriterionItem | { error: { message: string } } | null;
      if (!response.ok || !payload || "error" in payload) {
        setErrors({
          form:
            payload && "error" in payload ? payload.error.message : "Could not save the criterion.",
        });
        return;
      }
      onSaved(payload);
      onOpenChange(false);
    } catch {
      setErrors({ form: "Network error — please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit criterion" : "New criterion"}</DialogTitle>
            <DialogDescription>
              The judge scores every response 0–10 against the description (and rubric, if given).
              Past evaluations keep the definition they were run with.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="criterion-name">Name</Label>
            <Input
              id="criterion-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Code quality"
              maxLength={60}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby="criterion-key"
              autoFocus
            />
            <p id="criterion-key" className="text-xs text-muted-foreground">
              Key:{" "}
              <span className="font-mono text-foreground">
                {keyPreview ?? "derived from the name"}
              </span>
              {editing && " · fixed after creation"}
            </p>
            {errors.name && (
              <p className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="criterion-description">Description</Label>
            <Textarea
              id="criterion-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should the judge assess? e.g. Idiomatic, readable code with sensible naming, error handling and no dead code."
              rows={3}
              maxLength={600}
              aria-invalid={errors.description ? true : undefined}
            />
            {errors.description && (
              <p className="text-sm text-destructive" role="alert">
                {errors.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="criterion-rubric">
              Rubric <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="criterion-rubric"
              value={rubric}
              onChange={(event) => setRubric(event.target.value)}
              placeholder="9-10: … 7-8: … 4-6: … 0-3: …"
              rows={3}
              maxLength={1_000}
            />
            <p className="text-xs text-muted-foreground">
              Describe what separates high, middle and low scores for more consistent judging.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="criterion-weight">Default weight</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{weight}</span>
            </div>
            <Slider
              id="criterion-weight"
              value={[weight]}
              min={0}
              max={50}
              step={5}
              onValueChange={([value]) => setWeight(value ?? DEFAULT_WEIGHT)}
              aria-label="Default weight"
            />
            <p className="text-xs text-muted-foreground">
              Built-in weights range from 10 to 25; weights are normalized per evaluation.
            </p>
          </div>

          {errors.form && (
            <p className="text-sm text-destructive" role="alert">
              {errors.form}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? "Save changes" : "Create criterion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
