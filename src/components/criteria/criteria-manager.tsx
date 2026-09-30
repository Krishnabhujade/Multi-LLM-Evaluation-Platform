"use client";

import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CriterionDialog } from "@/components/criteria/criterion-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { CriterionItem } from "@/lib/api-types";
import { MAX_CUSTOM_CRITERIA } from "@/lib/criteria";

type DialogState = { key: number; criterion?: CriterionItem } | null;

function CriterionCard({
  criterion,
  onEdit,
  onDelete,
}: {
  criterion: CriterionItem;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {criterion.name}
          {criterion.isBuiltIn && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Lock className="size-3" aria-hidden /> Built-in
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{criterion.key}</CardDescription>
        {!criterion.isBuiltIn && (
          <CardAction className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`Edit ${criterion.name}`}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={`Delete ${criterion.name}`}
            >
              <Trash2 />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{criterion.description}</p>
        {criterion.rubric && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Rubric: </span>
            {criterion.rubric}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Default weight{" "}
          <span className="text-foreground tabular-nums">{criterion.defaultWeight}</span>
        </p>
      </CardContent>
    </Card>
  );
}

/** Lists built-in and custom criteria; custom ones can be created, edited and deleted. */
export function CriteriaManager({ initial }: { initial: CriterionItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<CriterionItem | null>(null);

  const builtIn = items.filter((item) => item.isBuiltIn);
  const custom = items.filter((item) => !item.isBuiltIn);
  const atLimit = custom.length >= MAX_CUSTOM_CRITERIA;

  const saved = (criterion: CriterionItem) => {
    const exists = items.some((item) => item.id === criterion.id);
    setItems(
      exists
        ? items.map((item) => (item.id === criterion.id ? criterion : item))
        : [...items, criterion],
    );
    toast.success(exists ? `Saved “${criterion.name}”` : `Created “${criterion.name}”`);
    router.refresh();
  };

  async function remove(criterion: CriterionItem) {
    const response = await fetch(`/api/criteria/${criterion.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!response?.ok) {
      toast.error("Could not delete the criterion.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== criterion.id));
    toast.success(`Deleted “${criterion.name}”`);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="custom-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="custom-heading" className="text-lg font-semibold">
              Custom criteria
            </h2>
            <p className="text-sm text-muted-foreground">
              {custom.length} of {MAX_CUSTOM_CRITERIA} · available in the criteria list of every new
              evaluation (off by default).
            </p>
          </div>
          <Button onClick={() => setDialog({ key: Date.now() })} disabled={atLimit}>
            <Plus aria-hidden /> New criterion
          </Button>
        </div>
        {custom.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No custom criteria yet. Add one to score what matters for your use case — for example
              “Code quality”, “Tone of voice” or “Cites sources”.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {custom.map((criterion) => (
              <CriterionCard
                key={criterion.id}
                criterion={criterion}
                onEdit={() => setDialog({ key: Date.now(), criterion })}
                onDelete={() => setDeleting(criterion)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="builtin-heading">
        <div className="space-y-1">
          <h2 id="builtin-heading" className="text-lg font-semibold">
            Built-in criteria
          </h2>
          <p className="text-sm text-muted-foreground">
            Used by default in every evaluation. Read-only — adjust their weights per evaluation.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {builtIn.map((criterion) => (
            <CriterionCard key={criterion.id} criterion={criterion} />
          ))}
        </div>
      </section>

      {dialog && (
        <CriterionDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          criterion={dialog.criterion}
          takenKeys={items.map((item) => item.key)}
          onSaved={saved}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be offered for new evaluations. Past evaluations keep their scores
              for this criterion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void remove(deleting);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
