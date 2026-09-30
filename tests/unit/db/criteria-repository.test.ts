import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { MAX_CUSTOM_CRITERIA } from "@/lib/criteria";
import { CriteriaRepository } from "@/server/db/criteria-repository";
import { ApiError } from "@/server/http/errors";

interface Row {
  id: string;
  key: string;
  name: string;
  description: string;
  rubric: string | null;
  defaultWeight: number;
  isBuiltIn: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Just enough of `prisma.criterion` for the repository, backed by an array. */
function fakePrisma(rows: Row[] = []) {
  let counter = 0;
  const matches = (row: Row, where: Partial<Row>) =>
    Object.entries(where).every(([field, value]) => row[field as keyof Row] === value);
  const criterion = {
    findMany: async ({ where }: { where: Partial<Row> }) =>
      rows.filter((row) => matches(row, where)),
    findUnique: async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
    create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "updatedAt"> }) => {
      counter += 1;
      const row = {
        ...data,
        id: `c${counter}`,
        createdAt: new Date(counter),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((candidate) => candidate.id === where.id)!;
      for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) Object.assign(row, { [field]: value });
      }
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      rows.splice(
        rows.findIndex((row) => row.id === where.id),
        1,
      );
    },
  };
  return { prisma: { criterion } as unknown as PrismaClient, rows };
}

const fields = {
  name: "Accuracy",
  description: "A custom take on accuracy for this team.",
  defaultWeight: 10,
};

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
}

describe("CriteriaRepository", () => {
  it("lists built-ins (from code) before the owner's custom criteria", async () => {
    const { prisma } = fakePrisma();
    const repo = new CriteriaRepository(prisma);
    await repo.create("u1", { ...fields, name: "Tone" });
    await repo.create("u2", { ...fields, name: "Other user's" });

    const list = await repo.list("u1");
    expect(list.slice(0, 6).every((item) => item.isBuiltIn)).toBe(true);
    expect(list[0]).toMatchObject({ id: "builtin_accuracy", key: "accuracy" });
    expect(list.slice(6).map((item) => item.key)).toEqual(["tone"]);
  });

  it("derives a unique key that never collides with a built-in", async () => {
    const { prisma } = fakePrisma();
    const repo = new CriteriaRepository(prisma);
    const first = await repo.create(null, fields);
    const second = await repo.create(null, { ...fields, rubric: "9-10: great." });
    expect(first).toMatchObject({ key: "accuracy_2", isBuiltIn: false, rubric: null });
    expect(second).toMatchObject({ key: "accuracy_3", rubric: "9-10: great." });
  });

  it("updates fields but never the key, and clears an emptied rubric", async () => {
    const { prisma } = fakePrisma();
    const repo = new CriteriaRepository(prisma);
    const created = await repo.create(null, { ...fields, name: "Tone", rubric: "x" });
    const updated = await repo.update(created.id, null, { name: "Voice", rubric: "" });
    expect(updated).toMatchObject({ key: "tone", name: "Voice", rubric: null });
  });

  it("keeps built-ins read-only and hides other owners' criteria", async () => {
    const { prisma } = fakePrisma([
      {
        id: "builtin_accuracy",
        key: "accuracy",
        name: "Accuracy",
        description: "d",
        rubric: null,
        defaultWeight: 25,
        isBuiltIn: true,
        userId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ]);
    const repo = new CriteriaRepository(prisma);
    await expectApiError(repo.update("builtin_accuracy", null, { name: "x" }), 403);
    await expectApiError(repo.delete("builtin_accuracy", null), 403);
    await expectApiError(repo.delete("missing", null), 404);

    const mine = await repo.create("u1", { ...fields, name: "Tone" });
    await expectApiError(repo.update(mine.id, "u2", { name: "x" }), 404);
    await repo.delete(mine.id, "u1");
    expect((await repo.list("u1")).some((item) => item.id === mine.id)).toBe(false);
  });

  it(`caps custom criteria at ${MAX_CUSTOM_CRITERIA} per owner`, async () => {
    const { prisma } = fakePrisma();
    const repo = new CriteriaRepository(prisma);
    for (let index = 0; index < MAX_CUSTOM_CRITERIA; index += 1) {
      await repo.create(null, { ...fields, name: `Criterion ${index}` });
    }
    await expectApiError(repo.create(null, fields), 409);
  });
});
