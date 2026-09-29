import { z } from "zod";
import { TASK_CATEGORIES } from "@/lib/categories";

/** Query parameters for `GET /api/evaluations` and the /history page. */
export const HistoryQuerySchema = z.object({
  category: z.enum(TASK_CATEGORIES).optional().catch(undefined),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).optional().catch(undefined),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20).catch(20),
});

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/** Accepts URLSearchParams or Next's `searchParams` record. */
export function parseHistoryQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): HistoryQuery {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return HistoryQuerySchema.parse({
    category: read("category"),
    status: read("status"),
    q: read("q"),
    cursor: read("cursor"),
    limit: read("limit"),
  });
}
