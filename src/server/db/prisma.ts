import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/server/env";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add your Postgres connection string to .env.");
    this.name = "DatabaseNotConfiguredError";
  }
}

// One client (and therefore one connection pool) per process: reused across dev hot reloads and
// across invocations on the same warm serverless instance.
const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient };

/** Lazily created so builds and tests that never touch the database don't need DATABASE_URL. */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;

  const { DATABASE_URL, DATABASE_POOL_MAX, NODE_ENV } = getEnv();
  if (!DATABASE_URL) throw new DatabaseNotConfiguredError();

  const client = new PrismaClient({
    // A small pool suits serverless (many instances × pool size ≤ the database's limit); set 1
    // for single-connection local servers such as `prisma dev`.
    adapter: new PrismaPg({
      connectionString: DATABASE_URL,
      ...(DATABASE_POOL_MAX !== undefined && { max: DATABASE_POOL_MAX }),
    }),
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.__prisma = client;
  return client;
}
