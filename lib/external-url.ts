export function normalizedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function hasInvalidExternalUrl(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && normalizedHttpUrl(value) === null;
}
