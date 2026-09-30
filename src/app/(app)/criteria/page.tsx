import type { Metadata } from "next";
import { connection } from "next/server";
import { CriteriaManager } from "@/components/criteria/criteria-manager";
import { DatabaseSetupNotice } from "@/components/shared/setup-notice";
import { CriteriaRepository } from "@/server/db/criteria-repository";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Criteria" };

export default async function CriteriaPage() {
  await connection();
  const configured = Boolean(getEnv().DATABASE_URL);
  const criteria = configured ? await new CriteriaRepository(getPrisma()).list(null) : [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation criteria</h1>
        <p className="max-w-2xl text-muted-foreground">
          The judge scores each response 0–10 per criterion; the weighted average decides the
          winner. Add your own criteria to measure what matters for your task.
        </p>
      </div>
      {configured ? <CriteriaManager initial={criteria} /> : <DatabaseSetupNotice />}
    </div>
  );
}
