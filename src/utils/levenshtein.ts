/**
 * Calculates the Levenshtein distance between two strings.
 * The distance is the minimum number of single-character edits (insertions,
 * deletions or substitutions) required to change one word into the other.
 * @param a The first string.
 * @param b The second string.
 * @returns The Levenshtein distance.
 */
export function calculateLevenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Initialize the matrix for dynamic programming
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  // Fill in the rest of the matrix
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // Deletion
        matrix[j - 1][i] + 1, // Insertion
        matrix[j - 1][i - 1] + substitutionCost, // Substitution
      );
    }
  }

  return matrix[b.length][a.length];
}
