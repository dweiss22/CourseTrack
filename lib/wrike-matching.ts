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
 * course data only — prefers the exact course code (most reliable
 * contains-match anchor), falling back to the course title.
 */
export function buildWrikeTaskSearchQuery(context: { courseCode: string; title: string }): string {
  const courseCode = context.courseCode.trim();
  return courseCode || context.title.trim();
}
