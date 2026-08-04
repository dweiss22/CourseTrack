/** Trim, collapse whitespace, lowercase, strip common punctuation. */
export function normalizeForMatch(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[.,;:!?'"()/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derives a search string for the local Wrike task index from existing
 * course data only, using meaningful title tokens. Course codes remain in
 * the context contract but are not assumed to appear in Wrike task names.
 */
export function buildWrikeTaskSearchQuery(context: { courseCode: string; title: string }): string {
  const stopWords = new Set(["and", "the", "for", "with", "from", "into", "course", "training"]);
  return normalizeForMatch(context.title)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .slice(0, 4)
    .join(" ");
}
