import z from "zod";

export const searchBodySchema = z.object({
  q: z.string().optional().default("").describe("Full-text search query."),
  tolerance: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .default(1)
    .describe("Levenshtein distance for fuzzy search."),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe("The page number to retrieve (1-indexed)."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Number of results per page."),
  fields: z
    .array(z.string())
    .optional()
    .describe("An array of field names to return in the document."),
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
});

export const addDocumentQuerySchema = z.object({
  id: z
    .string()
    .optional()
    .describe("A specific ID to assign to the new document."),
});
