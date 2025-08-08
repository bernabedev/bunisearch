import z from "zod";

export const searchBodySchema = z.object({
  q: z.string().optional().default("").describe("Full-text search query."),
  tolerance: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .default(0)
    .describe("Levenshtein distance for fuzzy search."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Number of results to return."),
  facets: z
    .array(z.string())
    .optional()
    .default([])
    .describe("List of fields to compute facets for."),
  filters: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'A JSON object for filtering results. e.g., `{"brand":"Essence","price":{"gte":50}}`',
    ),
  fields: z
    .array(z.string())
    .optional()
    .describe("A list of specific fields to return in the search results."),
  after: z
    .string()
    .optional()
    .describe("Cursor for pagination to fetch the next page of results."),
});

export const addDocumentQuerySchema = z.object({
  id: z
    .string()
    .optional()
    .describe("A specific ID to assign to the new document."),
});
