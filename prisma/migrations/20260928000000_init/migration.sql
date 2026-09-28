-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('GENERAL_QA', 'CODING', 'MATHEMATICS', 'REASONING', 'SUMMARIZATION', 'CREATIVE_WRITING', 'RESEARCH', 'DATA_ANALYSIS');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvaluationMode" AS ENUM ('STANDARD', 'PAIRWISE');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "JudgeStatus" AS ENUM ('PENDING', 'SCORED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LlmCallKind" AS ENUM ('CANDIDATE', 'JUDGE');

-- CreateEnum
CREATE TYPE "LlmCallStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capabilities" TEXT[],
    "contextWindow" INTEGER,
    "inputCostPerMTok" DOUBLE PRECISION,
    "outputCostPerMTok" DOUBLE PRECISION,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rubric" TEXT,
    "defaultWeight" DOUBLE PRECISION NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "EvaluationMode" NOT NULL DEFAULT 'STANDARD',
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "category" "TaskCategory" NOT NULL DEFAULT 'GENERAL_QA',
    "prompt" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "autoSelected" BOOLEAN NOT NULL DEFAULT false,
    "judgeModelId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "shuffleSeed" TEXT NOT NULL,
    "winnerResponseId" TEXT,
    "error" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_responses" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "anonLabel" TEXT NOT NULL,
    "judgeOrder" INTEGER NOT NULL,
    "content" TEXT,
    "finishReason" TEXT,
    "resolvedModel" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "judgeStatus" "JudgeStatus" NOT NULL DEFAULT 'PENDING',
    "judgedBy" TEXT,
    "judgeSummary" TEXT,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "judgeError" TEXT,
    "overallScore" DOUBLE PRECISION,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterion_scores" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "criterionKey" TEXT NOT NULL,
    "criterionName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "criterion_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "responseId" TEXT,
    "modelId" TEXT NOT NULL,
    "kind" "LlmCallKind" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "LlmCallStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "requestId" TEXT,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "models_providerId_modelId_key" ON "models"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_userId_key_key" ON "criteria"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_runs_winnerResponseId_key" ON "evaluation_runs"("winnerResponseId");

-- CreateIndex
CREATE INDEX "evaluation_runs_userId_createdAt_idx" ON "evaluation_runs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "evaluation_runs_category_createdAt_idx" ON "evaluation_runs"("category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "evaluation_runs_status_createdAt_idx" ON "evaluation_runs"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "model_responses_modelId_createdAt_idx" ON "model_responses"("modelId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "model_responses_runId_modelId_key" ON "model_responses"("runId", "modelId");

-- CreateIndex
CREATE INDEX "criterion_scores_criterionKey_idx" ON "criterion_scores"("criterionKey");

-- CreateIndex
CREATE UNIQUE INDEX "criterion_scores_responseId_criterionKey_key" ON "criterion_scores"("responseId", "criterionKey");

-- CreateIndex
CREATE INDEX "llm_calls_runId_startedAt_idx" ON "llm_calls"("runId", "startedAt");

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_judgeModelId_fkey" FOREIGN KEY ("judgeModelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_winnerResponseId_fkey" FOREIGN KEY ("winnerResponseId") REFERENCES "model_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_responses" ADD CONSTRAINT "model_responses_runId_fkey" FOREIGN KEY ("runId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_responses" ADD CONSTRAINT "model_responses_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterion_scores" ADD CONSTRAINT "criterion_scores_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "model_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_runId_fkey" FOREIGN KEY ("runId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "model_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
