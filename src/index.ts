// src/index.ts
import { calculateLevenshtein } from "./utils/levenshtein";
import { tokenize } from "./utils/tokenizer";

// --- Type Definitions ---
type Document = Record<string, any> & { id: string };

// Schema now supports marking fields as facetable
type SchemaProperty = {
  type: "string" | "number" | "boolean";
  facetable?: boolean;
};
type Schema = Record<string, SchemaProperty>;

type InvertedIndex = Map<string, Map<string, number>>; // Map<token, Map<docId, termFrequency>>
type FacetIndex = Map<string, Map<any, Set<string>>>; // Map<facetField, Map<facetValue, Set<docId>>>

type SearchOptions = {
  properties?: "*" | string[];
  tolerance?: number;
  limit?: number;
  facets?: string[]; // New: specify which facets to compute
};

type SearchResultHit = {
  id: string;
  score: number;
  document: Document;
};

// Result now includes a 'facets' object
type SearchResult = {
  hits: SearchResultHit[];
  count: number;
  facets?: Record<string, Record<string, number>>; // e.g., { author: { Anna: 2, Juan: 1 } }
  elapsed: bigint;
};

export class BuniSearch {
  private schema: Schema;
  private documents: Map<string, Document> = new Map();
  private invertedIndex: InvertedIndex = new Map();
  private facetIndex: FacetIndex = new Map(); // New index for facets
  private docCount = 0;

  constructor({ schema }: { schema: Schema }) {
    this.schema = schema;
    // Pre-initialize maps for facetable fields
    for (const key in schema) {
      if (schema[key].facetable) {
        this.facetIndex.set(key, new Map());
      }
    }
  }

  /**
   * Inserts a document, populating both the full-text and facet indexes.
   */
  public insert(doc: Record<string, any>): string {
    const id = crypto.randomUUID();
    const document: Document = { ...doc, id };
    this.documents.set(id, document);
    this.docCount++;

    for (const key in this.schema) {
      const value = document[key];
      if (value === undefined || value === null) continue;

      // 1. Populate the full-text index (same as before)
      if (this.schema[key].type === "string") {
        const tokens = tokenize(String(value));
        const termFrequencies: Record<string, number> = {};
        for (const token of tokens) {
          termFrequencies[token] = (termFrequencies[token] || 0) + 1;
        }
        for (const token in termFrequencies) {
          if (!this.invertedIndex.has(token))
            this.invertedIndex.set(token, new Map());
          this.invertedIndex.get(token)!.set(id, termFrequencies[token]);
        }
      }

      // 2. Populate the facet index
      if (this.schema[key].facetable) {
        const valueMap = this.facetIndex.get(key)!;
        if (!valueMap.has(value)) valueMap.set(value, new Set());
        valueMap.get(value)!.add(id);
      }
    }
    return id;
  }

  /**
   * Searches the index and optionally computes facet counts for the results.
   */
  public search(term: string, options: SearchOptions = {}): SearchResult {
    const startTime = process.hrtime.bigint();
    const { tolerance = 0, limit = 10, facets: requestedFacets = [] } = options;

    // --- Step 1: Full-text search to get matching documents (same as before) ---
    const queryTokens = tokenize(term);
    const scores: Map<string, number> = new Map();

    for (const queryToken of queryTokens) {
      const matchingTokens = this._findMatchingTokens(queryToken, tolerance);
      for (const { token: indexToken, distance } of matchingTokens) {
        const postings = this.invertedIndex.get(indexToken);
        if (!postings) continue;
        const idf = Math.log(
          1 + (this.docCount - postings.size + 0.5) / (postings.size + 0.5),
        );
        for (const [docId, tf] of postings.entries()) {
          const fuzzyPenalty =
            distance > 0 ? 1 - distance / queryToken.length : 1;
          const scoreIncrement = tf * idf * fuzzyPenalty;
          scores.set(docId, (scores.get(docId) || 0) + scoreIncrement);
        }
      }
    }

    const sortedDocs = Array.from(scores.entries()).sort(
      ([, a], [, b]) => b.score - a.score,
    );

    // --- Step 2: Calculate facets from the search results ---
    const allMatchingDocIds = sortedDocs.map(([docId]) => docId);
    const facetResults = this._calculateFacets(
      allMatchingDocIds,
      requestedFacets,
    );

    // --- Step 3: Format final response ---
    const hits: SearchResultHit[] = sortedDocs
      .slice(0, limit)
      .map(([docId, score]) => ({
        id: docId,
        score,
        document: this.documents.get(docId)!,
      }));

    const endTime = process.hrtime.bigint();

    return {
      hits,
      count: sortedDocs.length,
      facets: facetResults,
      elapsed: endTime - startTime,
    };
  }

  /**
   * Calculates facet counts for a given set of document IDs.
   */
  private _calculateFacets(
    docIds: string[],
    requestedFacets: string[],
  ): Record<string, Record<string, number>> {
    const results: Record<string, Record<string, number>> = {};
    if (requestedFacets.length === 0) return results;

    for (const facetField of requestedFacets) {
      if (!this.facetIndex.has(facetField)) continue; // Skip if field is not facetable

      const valueCounts: Record<string, number> = {};
      for (const docId of docIds) {
        const doc = this.documents.get(docId)!;
        const value = doc[facetField];
        if (value !== undefined && value !== null) {
          valueCounts[value] = (valueCounts[value] || 0) + 1;
        }
      }
      results[facetField] = valueCounts;
    }

    return results;
  }

  // Renamed to be a private method
  private _findMatchingTokens(
    queryToken: string,
    tolerance: number,
  ): { token: string; distance: number }[] {
    if (this.invertedIndex.has(queryToken)) {
      return [{ token: queryToken, distance: 0 }];
    }
    if (tolerance > 0) {
      const matches: { token: string; distance: number }[] = [];
      for (const indexToken of this.invertedIndex.keys()) {
        const distance = calculateLevenshtein(queryToken, indexToken);
        if (distance <= tolerance) {
          matches.push({ token: indexToken, distance });
        }
      }
      return matches;
    }
    return [];
  }
}
