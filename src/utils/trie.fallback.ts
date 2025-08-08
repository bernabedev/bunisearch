export class TrieNode {
  public children: Map<string, TrieNode> = new Map();
  public isEndOfWord: boolean = false;
}

export class Trie {
  private root: TrieNode = new TrieNode();

  /**
   * Inserts a word into the trie.
   * @param word The word to insert.
   */
  public insert(word: string): void {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char)!;
    }
    currentNode.isEndOfWord = true;
  }

  /**
   * Searches for a word in the trie to see if it exists.
   * @param word The word to search for.
   * @returns `true` if the word is in the trie, `false` otherwise.
   */
  public search(word: string): boolean {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        return false;
      }
      currentNode = currentNode.children.get(char)!;
    }
    return currentNode.isEndOfWord;
  }

  /**
   * Deletes a word from the trie.
   * @param word The word to delete.
   */
  public delete(word: string): void {
    this._delete(this.root, word, 0);
  }

  /**
   * Recursive helper for the delete operation.
   * @param node The current node.
   * @param word The word to delete.
   * @param index The current character index in the word.
   * @returns `true` if the parent node should delete the reference to the current node.
   */
  private _delete(node: TrieNode, word: string, index: number): boolean {
    if (index === word.length) {
      if (!node.isEndOfWord) {
        return false; // Word doesn't exist in the trie.
      }
      node.isEndOfWord = false;
      // If the node has no other children, it's safe to delete.
      return node.children.size === 0;
    }

    const char = word[index];
    if (!char) {
      return false; // Word doesn't exist.
    }
    const childNode = node.children.get(char);
    if (!childNode) {
      return false; // Word doesn't exist.
    }

    const shouldDeleteChild = this._delete(childNode, word, index + 1);

    if (shouldDeleteChild) {
      node.children.delete(char);
      // If the current node is not the end of another word and has no other children,
      // it can also be deleted by its parent.
      return !node.isEndOfWord && node.children.size === 0;
    }

    return false;
  }

  /**
   * Performs a fuzzy search to find all words in the trie within a given Levenshtein distance.
   * This will be implemented in the next step.
   * @param word The word to search for.
   * @param maxDistance The maximum allowed Levenshtein distance.
   * @returns An array of objects containing the matching token and its distance.
   */
  public searchFuzzy(
    word: string,
    maxDistance: number,
  ): { token: string; distance: number }[] {
    const results: { token: string; distance: number }[] = [];
    const currentRow = Array.from(Array(word.length + 1).keys());

    for (const [char, node] of this.root.children.entries()) {
      this._searchRecursive(node, char, word, currentRow, results, maxDistance);
    }

    return results;
  }

  private _searchRecursive(
    node: TrieNode,
    prefix: string,
    word: string,
    previousRow: number[],
    results: { token: string; distance: number }[],
    maxDistance: number,
  ): void {
    const columns = word.length + 1;

    const currentRow: number[] = [(previousRow[0] ?? 0) + 1];

    for (let i = 1; i < columns; i++) {
      const insertCost = (currentRow[i - 1] ?? 0) + 1;
      const deleteCost = (previousRow[i] ?? 0) + 1;
      const substitutionCost =
        word[i - 1] === prefix[prefix.length - 1]
          ? (previousRow[i - 1] ?? 0)
          : (previousRow[i - 1] ?? 0) + 1;

      currentRow.push(Math.min(insertCost, deleteCost, substitutionCost));
    }

    const lastDistance = currentRow[currentRow.length - 1] ?? Infinity;

    if (node.isEndOfWord && lastDistance <= maxDistance) {
      results.push({
        token: prefix,
        distance: lastDistance,
      });
    }

    if (Math.min(...currentRow) <= maxDistance) {
      for (const [char, nextNode] of node.children.entries()) {
        this._searchRecursive(
          nextNode,
          prefix + char,
          word,
          currentRow,
          results,
          maxDistance,
        );
      }
    }
  }
}
