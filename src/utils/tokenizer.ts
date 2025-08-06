/**
 * A language-agnostic tokenizer.
 * It performs the following steps:
 * 1. Converts the text to lower case.
 * 2. Splits the text into tokens using Unicode-aware patterns for letters and numbers.
 * 3. Filters out empty tokens.
 *
 * NOTE: This tokenizer does NOT perform stemming or stop-word removal to remain
 * language-agnostic without external dependencies. This means "run" and "running"
 * will be treated as different tokens.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  return (
    text
      .toLowerCase()
      // Split on any character that is NOT a letter (\p{L}) or a number (\p{N}) from any language.
      // The 'u' flag is essential for Unicode regex.
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 0)
  ); // Remove empty strings that can result from splitting
}
