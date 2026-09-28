import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/run/run-view";
import { DatabaseSetupNotice } from "@/components/shared/setup-notice";
import { DatabaseNotConfiguredError } from "@/server/db/prisma";
import { getEvaluation } from "@/server/evaluation/service";

async function loadRun(id: string) {
  try {
    return { run: await getEvaluation(id) };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) return { databaseMissing: true as const };
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/evaluations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const result = await loadRun(id).catch(() => null);
  const prompt = result && "run" in result ? result.run?.prompt : undefined;
  return {
    title: prompt ? (prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt) : "Evaluation",
  };
}

export default async function EvaluationPage({ params }: PageProps<"/evaluations/[id]">) {
  const { id } = await params;
  const result = await loadRun(id);
  if ("databaseMissing" in result) return <DatabaseSetupNotice />;
  if (!result.run) notFound();

  // Keyed by id so navigating between runs resets all client state.
  return <RunView key={result.run.id} initialRun={result.run} />;
}
