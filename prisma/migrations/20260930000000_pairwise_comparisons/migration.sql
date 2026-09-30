-- CreateEnum
CREATE TYPE "PairwiseOutcome" AS ENUM ('A', 'B', 'TIE');

-- CreateTable
CREATE TABLE "pairwise_comparisons" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "responseAId" TEXT NOT NULL,
    "responseBId" TEXT NOT NULL,
    "winner" "PairwiseOutcome" NOT NULL,
    "criteria" JSONB NOT NULL,
    "consistent" BOOLEAN NOT NULL,
    "orders" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "judgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pairwise_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pairwise_comparisons_runId_idx" ON "pairwise_comparisons"("runId");

-- AddForeignKey
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_runId_fkey" FOREIGN KEY ("runId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_responseAId_fkey" FOREIGN KEY ("responseAId") REFERENCES "model_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_responseBId_fkey" FOREIGN KEY ("responseBId") REFERENCES "model_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
