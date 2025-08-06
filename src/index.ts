import { calculateLevenshtein } from "./utils/levenshtein";
import { tokenize } from "./utils/tokenizer";

// --- Type Definitions ---
type Document = Record<string, any> & { id: string };
type Schema = Record<string, "string" | "number" | "boolean">;
type InvertedIndex = Map<string, Map<string, number>>; // Map<token, Map<docId, termFrequency>>

type SearchOptions = {
  properties?: "*" | string[];
  tolerance?: number; // Levenshtein distance for fuzzy search
  limit?: number;
};

type SearchResultHit = {
  id: string;
  score: number;
  document: Document;
};

type SearchResult = {
  hits: SearchResultHit[];
  count: number;
  elapsed: bigint; // Time taken in nanoseconds
};

export class BuniSearch {
  private schema: Schema;
  private documents: Map<string, Document> = new Map();
  private invertedIndex: InvertedIndex = new Map();
  private docCount = 0;

  constructor({ schema }: { schema: Schema }) {
    this.schema = schema;
  }

  /**
   * Inserts a document into the search index.
   * @param doc The document to index. Must match the defined schema.
   */
  public insert(doc: Record<string, any>): string {
    const id = crypto.randomUUID();
    const document: Document = { ...doc, id };
    this.documents.set(id, document);
    this.docCount++;

    for (const key in this.schema) {
      if (this.schema[key] === "string" && document[key]) {
        const tokens = tokenize(document[key]);
        const termFrequencies: Record<string, number> = {};
        for (const token of tokens) {
          termFrequencies[token] = (termFrequencies[token] || 0) + 1;
        }

        for (const token in termFrequencies) {
          if (!this.invertedIndex.has(token)) {
            this.invertedIndex.set(token, new Map());
          }
          this.invertedIndex.get(token)!.set(id, termFrequencies[token]);
        }
      }
    }
    return id;
  }

  /**
   * Searches the index for a given term.
   * @param term The search query.
   * @param options Search options like tolerance, limit, etc.
   * @returns A search result object with hits, count, and elapsed time.
   */
  public search(term: string, options: SearchOptions = {}): SearchResult {
    const startTime = process.hrtime.bigint();
    const { tolerance = 0, limit = 10 } = options;

    const queryTokens = tokenize(term);
    const scores: Map<string, { score: number; termMatches: Set<string> }> =
      new Map();

    for (const queryToken of queryTokens) {
      // Find exact or fuzzy matches for the query token in our index
      const matchingTokens = this.findMatchingTokens(queryToken, tolerance);

      for (const { token: indexToken, distance } of matchingTokens) {
        const postings = this.invertedIndex.get(indexToken);
        if (!postings) continue;

        // Calculate Inverse Document Frequency (IDF).
        // Rarer terms get a higher score.
        const idf = Math.log(
          1 + (this.docCount - postings.size + 0.5) / (postings.size + 0.5),
        );

        for (const [docId, tf] of postings.entries()) {
          // The relevance score is a product of TF and IDF.
          // We apply a penalty for fuzzy matches based on their distance.
          const fuzzyPenalty =
            distance > 0 ? 1 - distance / queryToken.length : 1;
          const score = tf * idf * fuzzyPenalty;

          if (!scores.has(docId)) {
            scores.set(docId, { score: 0, termMatches: new Set() });
          }
          const currentDocScore = scores.get(docId)!;

          // To avoid double-counting, only add score if this exact index term hasn't been processed for this doc yet.
          if (!currentDocScore.termMatches.has(indexToken)) {
            currentDocScore.score += score;
            currentDocScore.termMatches.add(indexToken);
          }
        }
      }
    }

    const sortedDocs = Array.from(scores.entries()).sort(
      ([, a], [, b]) => b.score - a.score,
    );

    const hits: SearchResultHit[] = sortedDocs
      .slice(0, limit)
      .map(([docId, { score }]) => ({
        id: docId,
        score,
        document: this.documents.get(docId)!,
      }));

    const endTime = process.hrtime.bigint();

    return {
      hits,
      count: hits.length,
      elapsed: endTime - startTime,
    };
  }

  /**
   * Finds tokens in the index that match the query token, either exactly or within a given Levenshtein distance.
   * NOTE: For large vocabularies, this linear scan is a performance bottleneck.
   * Production engines use more advanced data structures like Tries or BK-Trees.
   */
  private findMatchingTokens(
    queryToken: string,
    tolerance: number,
  ): { token: string; distance: number }[] {
    // An exact match is always preferred and is much faster.
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
