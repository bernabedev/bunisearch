import { tokenize } from "./utils/tokenizer";
import { Trie } from "./utils/trie";

// --- Type Definitions ---
type Document = Record<string, any> & { id: string };

type SchemaProperty = {
  type: "string" | "number" | "boolean";
  facetable?: boolean;
  sortable?: boolean;
};
type Schema = Record<string, SchemaProperty>;

type InvertedIndex = Map<string, Map<string, number[]>>; // Stores token positions
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
  elapsed: number;
};

type SerializableState = {
  schema: Schema;
  docCount: number;
  documents: [string, Document][];
  invertedIndex: [string, [string, number[]][]][];
  facetIndex: [string, [any, string[]][]][];
  numericIndex: [string, { value: number; docId: string }[]][];
  // BM25-specific state
  docLengths: [string, number][];
  totalDocLength: number;
};

export class BuniSearch {
  private schema: Schema;
  private documents: Map<string, Document> = new Map();
  private invertedIndex: InvertedIndex = new Map();
  private vocabularyTrie: Trie = new Trie();
  private facetIndex: FacetIndex = new Map();
  private numericIndex: NumericIndex = new Map();
  public docCount = 0;

  // BM25 parameters
  private k1 = 1.5;
  private b = 0.75;

  // Document length tracking for BM25
  private docLengths: Map<string, number> = new Map();
  private totalDocLength = 0;

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
   * Adds a new document to the index.
   * @param doc The document data to add.
   * @param specifiedId Optional: An ID to use for the document. If not provided, a new UUID is generated.
   * @returns The ID of the added document.
   */
  public add(doc: Record<string, any>, specifiedId?: string): string {
    const id = specifiedId || crypto.randomUUID();
    if (this.documents.has(id)) {
      throw new Error(
        `Document with ID "${id}" already exists. Use update() instead.`,
      );
    }

    const document: Document = { ...doc, id };
    this.documents.set(id, document);
    this.docCount++;

    let docLength = 0; // This still correctly tracks the total number of tokens for BM25.
    let tokenPositionOffset = 0; // The running position offset for phrase search.

    for (const key in this.schema) {
      const value = document[key];
      if (value === undefined || value === null) continue;

      const propSchema = this.schema[key];
      if (!propSchema) continue;

      if (propSchema.type === "string") {
        const tokenCount = this._indexText(
          id,
          String(value),
          tokenPositionOffset,
        );
        docLength += tokenCount;
        tokenPositionOffset += tokenCount; // Increment the offset for the next field.
      }
      if (propSchema.facetable) {
        this._indexFacet(id, key, value);
      }
      if (propSchema.type === "number" && propSchema.sortable) {
        this._indexNumeric(id, key, value);
      }
    }

    // Store the calculated length for this document (for BM25)
    this.docLengths.set(id, docLength);
    this.totalDocLength += docLength;

    return id;
  }

  /**
   * Deletes a document from the index by its ID.
   * @param docId The ID of the document to delete.
   * @returns `true` if the document was found and deleted, `false` otherwise.
   */
  public delete(docId: string): boolean {
    const docToDelete = this.documents.get(docId);
    if (!docToDelete) {
      return false; // Document not found
    }

    // --- BM25 Change: Update document length tracking ---
    const docLength = this.docLengths.get(docId) || 0;
    this.totalDocLength -= docLength;
    this.docLengths.delete(docId);
    // --- End of BM25 Change ---

    // Un-index the document from all data structures
    this._unindexText(docId, docToDelete);
    this._unindexFacet(docId, docToDelete);
    this._unindexNumeric(docId, docToDelete);

    // Finally, remove the document itself
    this.documents.delete(docId);
    this.docCount--;

    return true;
  }

  /**
   * Updates an existing document. This is an atomic operation (delete + add).
   * @param docId The ID of the document to update.
   * @param partialDoc An object containing the fields to update.
   * @returns `true` if the document was found and updated, `false` otherwise.
   */
  public update(docId: string, partialDoc: Record<string, any>): boolean {
    const originalDoc = this.documents.get(docId);
    if (!originalDoc) {
      return false; // Document to update not found
    }

    // Perform the deletion of the old document state
    this.delete(docId);

    // Create the new document state by merging old and new data
    const newDocData = { ...originalDoc, ...partialDoc };

    // Add the new document state back with the same ID
    this.add(newDocData, docId);

    return true;
  }

  // =================================================================
  // PERSISTENCE METHODS
  // =================================================================

  /**
   * Saves the current state of the search index to a file.
   * @param filePath The path where the index file will be saved.
   */
  async save(filePath: string): Promise<void> {
    const serializableState: SerializableState = {
      schema: this.schema,
      docCount: this.docCount,
      totalDocLength: this.totalDocLength,
      docLengths: Array.from(this.docLengths.entries()),
      // Convert Maps and Sets to JSON-compatible Arrays
      documents: Array.from(this.documents.entries()),
      invertedIndex: Array.from(this.invertedIndex.entries()).map(
        ([token, postings]) => [token, Array.from(postings.entries())],
      ),
      facetIndex: Array.from(this.facetIndex.entries()).map(
        ([field, values]) => [
          field,
          Array.from(values.entries()).map(([value, idSet]) => [
            value,
            Array.from(idSet),
          ]),
        ],
      ),
      numericIndex: Array.from(this.numericIndex.entries()),
    };

    const jsonString = JSON.stringify(serializableState, null, 2); // Pretty-print for readability
    await Bun.write(filePath, jsonString);
  }

  /**
   * Creates a new BuniSearch instance by loading an index from a file.
   * @param filePath The path of the index file to load.
   * @returns A new, fully hydrated BuniSearch instance.
   */
  static async load(filePath: string): Promise<BuniSearch> {
    const fileContent = await Bun.file(filePath).text();
    const state: SerializableState = JSON.parse(fileContent);

    // 1. Create a new instance with the loaded schema
    const db = new BuniSearch({ schema: state.schema });

    // 2. Hydrate the instance with the loaded data
    db.docCount = state.docCount;
    db.totalDocLength = state.totalDocLength;
    db.docLengths = new Map(state.docLengths);

    // Reconstruct Maps and Sets from the Arrays
    db.documents = new Map(state.documents);
    db.invertedIndex = new Map(
      state.invertedIndex.map(([token, postings]) => [
        token,
        new Map(postings),
      ]),
    );
    db.facetIndex = new Map(
      state.facetIndex.map(([field, values]) => [
        field,
        new Map(values.map(([value, idArray]) => [value, new Set(idArray)])),
      ]),
    );
    db.numericIndex = new Map(state.numericIndex);

    // --- Trie Change: Rebuild the vocabulary trie from the loaded index ---
    for (const token of db.invertedIndex.keys()) {
      db.vocabularyTrie.insert(token);
    }
    // --- End of Trie Change ---

    return db;
  }

  // =================================================================
  // PRIVATE INDEXING METHODS (Correctly Implemented)
  // =================================================================

  private _indexText(id: string, value: string, basePosition: number): number {
    const tokens = tokenize(value);
    // This map will store the token and its list of positions within this specific `value` string.
    const tokenPositions: Map<string, number[]> = new Map();

    tokens.forEach((token, index) => {
      if (!tokenPositions.has(token)) {
        tokenPositions.set(token, []);
      }
      // The position is the token's index in the current field's tokens, plus the base offset.
      tokenPositions.get(token)!.push(basePosition + index);
    });

    // Now, merge these new positions with any existing positions for this document.
    for (const [token, positions] of tokenPositions.entries()) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Map());
        this.vocabularyTrie.insert(token);
      }
      const postings = this.invertedIndex.get(token)!;

      if (!postings.has(id)) {
        postings.set(id, []);
      }
      // Append the new positions.
      postings.get(id)!.push(...positions);
    }

    return tokens.length;
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

  // --- Un-indexing (New Methods) ---
  private _unindexText(docId: string, doc: Document) {
    for (const key in this.schema) {
      if (this.schema[key]?.type === "string" && doc[key]) {
        const tokens = tokenize(String(doc[key]));
        // Use a Set to process each unique token only once per field
        for (const token of new Set(tokens)) {
          const postings = this.invertedIndex.get(token);
          if (postings) {
            postings.delete(docId);
            // Clean up: if no documents are associated with this token, remove the token itself
            if (postings.size === 0) {
              this.vocabularyTrie.delete(token);
              this.invertedIndex.delete(token);
            }
          }
        }
      }
    }
  }

  private _unindexFacet(docId: string, doc: Document) {
    for (const key in this.schema) {
      if (
        this.schema[key]?.facetable &&
        doc[key] !== undefined &&
        doc[key] !== null
      ) {
        const value = doc[key];
        const valueMap = this.facetIndex.get(key);
        if (valueMap) {
          const idSet = valueMap.get(value);
          if (idSet) {
            idSet.delete(docId);
            // Clean up: if no documents have this facet value, remove the value itself
            if (idSet.size === 0) {
              valueMap.delete(value);
            }
          }
        }
      }
    }
  }

  private _unindexNumeric(docId: string, doc: Document) {
    for (const key in this.schema) {
      if (
        this.schema[key]?.type === "number" &&
        this.schema[key].sortable &&
        doc[key] !== undefined &&
        doc[key] !== null
      ) {
        const sortedList = this.numericIndex.get(key);
        if (sortedList) {
          const indexToRemove = sortedList.findIndex(
            (item) => item.docId === docId,
          );
          if (indexToRemove > -1) {
            sortedList.splice(indexToRemove, 1);
          }
        }
      }
    }
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
      const endTime = process.hrtime.bigint();
      const elapsedNs = endTime - startTime;
      const elapsedMs = Number(elapsedNs / 1000000n);
      return {
        hits: [],
        count: 0,
        facets: {},
        elapsed: elapsedMs,
      };
    }

    // STAGE 2: FULL-TEXT SEARCH
    const scores: Map<string, number> = new Map();
    const avgdl = this.docCount > 0 ? this.totalDocLength / this.docCount : 0;
    const isPhraseSearch =
      term.length > 2 && term.startsWith('"') && term.endsWith('"');

    if (term) {
      if (isPhraseSearch) {
        // --- PHRASE SEARCH ---
        const phrase = term.slice(1, -1);
        const queryTokens = tokenize(phrase);
        if (queryTokens.length === 0) {
          return { hits: [], count: 0, elapsed: 0 };
        }

        // 1. Find candidate documents (intersection of doc IDs for all tokens)
        let candidateDocIds: Set<string> | null = null;
        for (const token of queryTokens) {
          const postings = this.invertedIndex.get(token);
          if (!postings) {
            candidateDocIds = new Set();
            break;
          }
          const docIdsForToken = new Set(postings.keys());
          if (candidateDocIds === null) {
            candidateDocIds = docIdsForToken;
          } else {
            candidateDocIds = new Set(
              [...candidateDocIds].filter((id: string) =>
                docIdsForToken.has(id),
              ),
            );
          }
        }

        // 2. For each candidate, verify proximity and score
        for (const docId of candidateDocIds || []) {
          if (
            (allowedDocIds === null || allowedDocIds.has(docId)) &&
            this._verifyPhraseProximity(docId, queryTokens)
          ) {
            let docScore = 0;
            const docLength = this.docLengths.get(docId)!;
            for (const token of queryTokens) {
              const postings = this.invertedIndex.get(token)!;
              const positions = postings.get(docId)!;
              const tf = positions.length;
              const idf = Math.log(
                1 +
                  (this.docCount - postings.size + 0.5) / (postings.size + 0.5),
              );
              const numerator = tf * (this.k1 + 1);
              const denominator =
                tf + this.k1 * (1 - this.b + this.b * (docLength / avgdl));
              docScore += idf * (numerator / denominator);
            }
            scores.set(docId, docScore * 1.5); // Add a 50% bonus for phrase match
          }
        }
      } else {
        // --- TERM SEARCH (REGULAR) ---
        const queryTokens = tokenize(term);
        for (const queryToken of queryTokens) {
          const matchingTokens = this._findMatchingTokens(
            queryToken,
            tolerance,
          );
          for (const { token: indexToken, distance } of matchingTokens) {
            const postings = this.invertedIndex.get(indexToken);
            if (!postings) continue;

            const idf = Math.log(
              1 + (this.docCount - postings.size + 0.5) / (postings.size + 0.5),
            );

            for (const [docId, positions] of postings.entries()) {
              if (allowedDocIds === null || allowedDocIds.has(docId)) {
                const docLength = this.docLengths.get(docId);
                if (docLength === undefined) continue;

                const tf = positions.length; // Use position count as term frequency
                const numerator = tf * (this.k1 + 1);
                const denominator =
                  tf + this.k1 * (1 - this.b + this.b * (docLength / avgdl));
                const bm25ScoreForTerm = idf * (numerator / denominator);

                const fuzzyPenalty =
                  distance > 0 ? 1 - distance / queryToken.length : 1;
                const scoreIncrement = bm25ScoreForTerm * fuzzyPenalty;

                scores.set(docId, (scores.get(docId) || 0) + scoreIncrement);
              }
            }
          }
        }
      }
    } else if (allowedDocIds) {
      for (const docId of allowedDocIds) {
        scores.set(docId, 1.0);
      }
    }

    const sortedDocs = Array.from(scores.entries()).sort(
      ([, a], [, b]) => b - a,
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

    const endTime = process.hrtime.bigint();
    const elapsedNs = endTime - startTime;
    const elapsedMs = Number(elapsedNs / 1000000n);

    return {
      hits,
      count: sortedDocs.length,
      facets: facetResults,
      elapsed: elapsedMs,
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
          [...intersection].filter((id: string) => currentIds.has(id)),
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
    // First, check for an exact match, which is the most common and fastest case.
    if (this.invertedIndex.has(queryToken)) {
      return [{ token: queryToken, distance: 0 }];
    }

    // If no exact match and tolerance is specified, use the Trie for fuzzy search.
    if (tolerance > 0) {
      return this.vocabularyTrie.searchFuzzy(queryToken, tolerance);
    }

    // If no exact match and no tolerance, return no matches.
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

  private _findConsecutive(
    targetPosition: number,
    tokenIndex: number,
    allPositions: readonly number[][],
  ): boolean {
    if (tokenIndex >= allPositions.length) {
      return true; // Successfully found a consecutive path for all tokens.
    }

    const currentTokenPositions = allPositions[tokenIndex];
    // Binary search for targetPosition in the sorted currentTokenPositions array.
    let low = 0;
    let high = (currentTokenPositions?.length ?? 0) - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midVal = currentTokenPositions?.[mid] ?? 0;
      if (midVal === targetPosition) {
        // Found the next token in the sequence, recurse to find the rest.
        return this._findConsecutive(
          targetPosition + 1,
          tokenIndex + 1,
          allPositions,
        );
      }
      if (midVal < targetPosition) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // The target position was not found in the current token's positions.
    return false;
  }

  private _verifyPhraseProximity(
    docId: string,
    tokens: readonly string[],
  ): boolean {
    if (tokens.length === 0) {
      return false;
    }

    const tokenPositionsInDoc: number[][] = [];
    for (const token of tokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings || !postings.has(docId)) {
        return false; // This document doesn't contain all tokens.
      }
      tokenPositionsInDoc.push(postings.get(docId)!);
    }

    if (tokens.length === 1) {
      return tokenPositionsInDoc[0].length > 0;
    }

    const firstTokenPositions = tokenPositionsInDoc[0];
    // For each possible start position of the phrase...
    for (const startPos of firstTokenPositions) {
      // ...check if the rest of the phrase follows consecutively.
      if (this._findConsecutive(startPos + 1, 1, tokenPositionsInDoc)) {
        return true; // Found a valid phrase match.
      }
    }

    return false; // No sequence matched.
  }
}
