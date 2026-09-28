import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; locally DATABASE_URL is enough.
    // Read lazily via process.env so `prisma generate` works without a database (CI, fresh clones).
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
});
