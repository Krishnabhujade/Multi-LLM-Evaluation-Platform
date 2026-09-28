/**
 * Development seed: providers, their default models and the built-in evaluation criteria.
 *
 * Idempotent — safe to run repeatedly. Models from the "demo" provider are fake development data
 * (flagged `isDemo`) and are labelled as such everywhere in the UI.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PROVIDER_CATALOG } from "../src/server/llm/catalog";
import { upsertBuiltInCriteria, upsertModel, upsertProvider } from "../src/server/db/catalog-sync";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — add it to .env before seeding.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  let modelCount = 0;
  for (const provider of PROVIDER_CATALOG) {
    await upsertProvider(prisma, provider);
    for (const model of provider.models) {
      await upsertModel(prisma, provider, model);
      modelCount += 1;
    }
  }
  await upsertBuiltInCriteria(prisma);

  console.log(
    `Seeded ${PROVIDER_CATALOG.length} providers, ${modelCount} models and built-in criteria.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
