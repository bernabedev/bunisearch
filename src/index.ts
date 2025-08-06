import { calculateLevenshtein } from "./utils/levenshtein";
import { tokenize } from "./utils/tokenizer";

// --- Type Definitions ---
type Document = Record<string, any> & { id: string };

type SchemaProperty = {
  type: "string" | "number" | "boolean";
  facetable?: boolean;
  sortable?: boolean;
};
type Schema = Record<string, SchemaProperty>;

type InvertedIndex = Map<string, Map<string, number>>;
type FacetIndex = Map<string, Map<any, Set<string>>>;
type NumericIndex = Map<string, Array<{ value: number; docId: string }>>;

type RangeFilter = { gte?: number; lte?: number; gt?: number; lt?: number };
type Filters = Record<string, any | RangeFilter>;

type SearchOptions = {
  tolerance?: number;
  limit?: number;
  facets?: string[];
  filters?: Filters;
};

type SearchResultHit = { id: string; score: number; document: Document };
type SearchResult = {
  hits: SearchResultHit[];
  count: number;
  facets?: Record<string, Record<string, number>>;
  elapsed: bigint;
};

export class BuniSearch {
  private schema: Schema;
  private documents: Map<string, Document> = new Map();
  private invertedIndex: InvertedIndex = new Map();
  private facetIndex: FacetIndex = new Map();
  private numericIndex: NumericIndex = new Map();
  private docCount = 0;

  constructor({ schema }: { schema: Schema }) {
    this.schema = schema;
    for (const key in schema) {
      if (!schema[key]) continue;

      if (schema[key].facetable) this.facetIndex.set(key, new Map());
      if (schema[key].type === "number" && schema[key].sortable) {
        this.numericIndex.set(key, []);
      }
    }
  }

  /**
   * Main method to insert a document. It orchestrates indexing across different structures.
   */
  public insert(doc: Record<string, any>): string {
    const id = crypto.randomUUID();
    const document: Document = { ...doc, id };
    this.documents.set(id, document);
    this.docCount++;

    for (const key in this.schema) {
      const value = document[key];
      if (value === undefined || value === null) continue;

      const propSchema = this.schema[key];

      if (!propSchema) continue;

      if (propSchema.type === "string") this._indexText(id, key, String(value));
      if (propSchema.facetable) this._indexFacet(id, key, value);
      if (propSchema.type === "number" && propSchema.sortable)
        this._indexNumeric(id, key, value);
    }
    return id;
  }

  // =================================================================
  // PRIVATE INDEXING METHODS (Correctly Implemented)
  // =================================================================

  private _indexText(id: string, key: string, value: string) {
    const tokens = tokenize(value);
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

  private _indexFacet(id: string, key: string, value: any) {
    const valueMap = this.facetIndex.get(key)!;
    if (!valueMap.has(value)) valueMap.set(value, new Set());
    valueMap.get(value)!.add(id);
  }

  private _indexNumeric(id: string, key: string, value: number) {
    const sortedList = this.numericIndex.get(key)!;
    sortedList.push({ value, docId: id });
    sortedList.sort((a, b) => a.value - b.value);
  }

  // =================================================================
  // PUBLIC SEARCH METHOD & PRIVATE HELPERS
  // =================================================================

  public search(term: string, options: SearchOptions = {}): SearchResult {
    const startTime = process.hrtime.bigint();
    const {
      tolerance = 0,
      limit = 10,
      facets: requestedFacets = [],
      filters = {},
    } = options;

    // STAGE 1: FILTERING
    let allowedDocIds: Set<string> | null = this._applyFilters(filters);
    if (allowedDocIds && allowedDocIds.size === 0) {
      return {
        hits: [],
        count: 0,
        facets: {},
        elapsed: process.hrtime.bigint() - startTime,
      };
    }

    // STAGE 2: FULL-TEXT SEARCH
    const scores: Map<string, number> = new Map();
    // If there's a search term, perform the search. Otherwise, all filtered docs are results.
    if (term) {
      const queryTokens = tokenize(term);
      for (const queryToken of queryTokens) {
        const matchingTokens = this._findMatchingTokens(queryToken, tolerance);
        for (const { token: indexToken, distance } of matchingTokens) {
          const postings = this.invertedIndex.get(indexToken);
          if (!postings) continue;
          const idf = Math.log(
            1 + (this.docCount - postings.size + 0.5) / (postings.size + 0.5),
          );
          for (const [docId, tf] of postings.entries()) {
            if (allowedDocIds === null || allowedDocIds.has(docId)) {
              const fuzzyPenalty =
                distance > 0 ? 1 - distance / queryToken.length : 1;
              const scoreIncrement = tf * idf * fuzzyPenalty;
              scores.set(docId, (scores.get(docId) || 0) + scoreIncrement);
            }
          }
        }
      }
    } else if (allowedDocIds) {
      // No search term, but filters were applied. All filtered documents get a default score.
      for (const docId of allowedDocIds) {
        scores.set(docId, 1.0);
      }
    } else {
      // No search term and no filters. This case could return all documents, but let's return none.
      // A real-world app might have a different requirement here.
      return {
        hits: [],
        count: 0,
        elapsed: process.hrtime.bigint() - startTime,
      };
    }

    const sortedDocs = Array.from(scores.entries()).sort(
      ([, a], [, b]) => b.score - a.score,
    );

    // STAGE 3: FACETING
    const searchResultDocIds = sortedDocs.map(([docId]) => docId);
    const facetResults = this._calculateFacets(
      searchResultDocIds,
      requestedFacets,
    );

    // Format final response
    const hits: SearchResultHit[] = sortedDocs
      .slice(0, limit)
      .map(([docId, score]) => ({
        id: docId,
        score,
        document: this.documents.get(docId)!,
      }));

    return {
      hits,
      count: sortedDocs.length,
      facets: facetResults,
      elapsed: process.hrtime.bigint() - startTime,
    };
  }

  private _applyFilters(filters: Filters): Set<string> | null {
    let intersection: Set<string> | null = null;
    const hasFilters = Object.keys(filters).length > 0;

    if (!hasFilters) return null; // No filters applied, so all documents are allowed initially.

    for (const field in filters) {
      if (!this.schema[field]) continue;
      let currentIds: Set<string>;
      const filterValue = filters[field];
      if (
        typeof filterValue === "object" &&
        !Array.isArray(filterValue) &&
        filterValue !== null &&
        (filterValue.gte || filterValue.lte || filterValue.gt || filterValue.lt)
      ) {
        currentIds = this._getIdsFromNumericRange(field, filterValue);
      } else {
        currentIds = this._getIdsFromTerm(field, filterValue);
      }
      if (intersection === null) {
        intersection = currentIds;
      } else {
        intersection = new Set(
          [...intersection].filter((id) => currentIds.has(id)),
        );
      }
      if (intersection.size === 0) return intersection;
    }
    return intersection;
  }

  private _getIdsFromTerm(field: string, value: any): Set<string> {
    const facetMap = this.facetIndex.get(field);
    return facetMap?.get(value) || new Set();
  }

  private _getIdsFromNumericRange(
    field: string,
    range: RangeFilter,
  ): Set<string> {
    const sortedList = this.numericIndex.get(field);
    if (!sortedList) return new Set();
    const results = new Set<string>();
    for (const item of sortedList) {
      const { value, docId } = item;
      const gte = range.gte === undefined || value >= range.gte;
      const lte = range.lte === undefined || value <= range.lte;
      const gt = range.gt === undefined || value > range.gt;
      const lt = range.lt === undefined || value < range.lt;
      if (gte && lte && gt && lt) results.add(docId);
    }
    return results;
  }

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

  private _calculateFacets(
    docIds: string[],
    requestedFacets: string[],
  ): Record<string, Record<string, number>> {
    const results: Record<string, Record<string, number>> = {};
    if (requestedFacets.length === 0 || docIds.length === 0) return results;

    for (const facetField of requestedFacets) {
      if (!this.facetIndex.has(facetField)) continue;
      const valueCounts: Record<string, number> = {};
      for (const docId of docIds) {
        const doc = this.documents.get(docId)!;
        const value = doc[facetField];
        if (value !== undefined && value !== null) {
          valueCounts[value] = (valueCounts[value] || 0) + 1;
        }
      }
      if (Object.keys(valueCounts).length > 0) {
        results[facetField] = valueCounts;
      }
    }
    return results;
  }
}
