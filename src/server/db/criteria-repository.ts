import "server-only";
import type { Criterion, PrismaClient } from "@/generated/prisma/client";
import type { CriterionItem } from "@/lib/api-types";
import {
  BUILT_IN_CRITERIA,
  MAX_CUSTOM_CRITERIA,
  criterionKeyFromName,
  type CriterionFields,
} from "@/lib/criteria";
import { ApiError } from "@/server/http/errors";

const BUILT_IN_CREATED_AT = new Date(0).toISOString();

function toItem(row: Criterion): CriterionItem {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    rubric: row.rubric,
    defaultWeight: row.defaultWeight,
    isBuiltIn: row.isBuiltIn,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Criterion definitions. Built-ins are seeded and read-only; custom criteria belong to an owner
 * (`userId`; null until accounts exist). A run snapshots its criteria, so editing or deleting a
 * definition never changes past results.
 */
export class CriteriaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Built-ins first (in their canonical order), then the owner's custom criteria, oldest first. */
  async list(userId: string | null): Promise<CriterionItem[]> {
    const custom = await this.prisma.criterion.findMany({
      where: { isBuiltIn: false, userId },
      orderBy: { createdAt: "asc" },
    });
    // Built-in definitions live in code (the seed mirrors them), so they never drift.
    const builtIn = BUILT_IN_CRITERIA.map((criterion): CriterionItem => ({
      id: `builtin_${criterion.key}`,
      key: criterion.key,
      name: criterion.name,
      description: criterion.description,
      rubric: criterion.rubric,
      defaultWeight: criterion.defaultWeight,
      isBuiltIn: true,
      createdAt: BUILT_IN_CREATED_AT,
    }));
    return [...builtIn, ...custom.map(toItem)];
  }

  async create(userId: string | null, fields: CriterionFields): Promise<CriterionItem> {
    const custom = await this.prisma.criterion.findMany({
      where: { isBuiltIn: false, userId },
      select: { key: true },
    });
    if (custom.length >= MAX_CUSTOM_CRITERIA) {
      throw new ApiError(
        409,
        "LIMIT_REACHED",
        `You can keep up to ${MAX_CUSTOM_CRITERIA} custom criteria — delete one first.`,
      );
    }
    const taken = [
      ...BUILT_IN_CRITERIA.map((criterion) => criterion.key),
      ...custom.map((criterion) => criterion.key),
    ];
    const row = await this.prisma.criterion.create({
      data: {
        key: criterionKeyFromName(fields.name, taken),
        name: fields.name,
        description: fields.description,
        rubric: fields.rubric ?? null,
        defaultWeight: fields.defaultWeight,
        isBuiltIn: false,
        userId,
      },
    });
    return toItem(row);
  }

  async update(
    id: string,
    userId: string | null,
    patch: Partial<CriterionFields>,
  ): Promise<CriterionItem> {
    await this.findEditable(id, userId);
    const row = await this.prisma.criterion.update({
      where: { id },
      data: {
        name: patch.name,
        description: patch.description,
        defaultWeight: patch.defaultWeight,
        ...(patch.rubric !== undefined && { rubric: patch.rubric || null }),
      },
    });
    return toItem(row);
  }

  async delete(id: string, userId: string | null): Promise<void> {
    await this.findEditable(id, userId);
    await this.prisma.criterion.delete({ where: { id } });
  }

  private async findEditable(id: string, userId: string | null): Promise<Criterion> {
    const row = await this.prisma.criterion.findUnique({ where: { id } });
    if (!row || (!row.isBuiltIn && row.userId !== userId)) {
      throw new ApiError(404, "NOT_FOUND", "Criterion not found");
    }
    if (row.isBuiltIn) {
      throw new ApiError(403, "READ_ONLY", "Built-in criteria cannot be changed.");
    }
    return row;
  }
}
