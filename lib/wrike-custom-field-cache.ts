import type { WrikeCustomFieldDefinition } from "@/lib/wrike-custom-fields";

/**
 * TTL cache for the Wrike account custom-field catalogue.
 *
 * The catalogue is fetched to decorate task-search results, which run on a
 * debounced, interactive path -- without a cache every keystroke would cost one
 * Wrike request. The catalogue changes rarely, so a long positive TTL is safe.
 *
 * Failures and empty catalogues are cached only briefly. Never caching a
 * failure would let a Wrike outage turn every keystroke into a fresh doomed
 * request; caching it for the full positive TTL would keep field names missing
 * for ten minutes after Wrike recovered.
 */

export const DEFAULT_POSITIVE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_NEGATIVE_TTL_MS = 45 * 1000;

interface CacheEntry {
  definitions: WrikeCustomFieldDefinition[];
  expiresAtMs: number;
}

const entries = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<WrikeCustomFieldDefinition[]>>();

export interface CustomFieldCacheOptions {
  nowMs?: () => number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
}

/**
 * Returns the cached catalogue for `key`, invoking `loader` at most once per
 * key at a time (concurrent callers share the in-flight promise). Never
 * rejects: a failing loader resolves to an empty list so the caller's primary
 * work -- searching the local task index -- is never blocked by Wrike.
 *
 * `key` should identify the account, not just the host: every Wrike tenant is
 * served from the same default host, so keying on host alone would let one
 * account's field titles survive a reconnect to another.
 */
export async function getCachedCustomFieldDefinitions(
  key: string,
  loader: () => Promise<WrikeCustomFieldDefinition[]>,
  options: CustomFieldCacheOptions = {},
): Promise<WrikeCustomFieldDefinition[]> {
  const nowMs = options.nowMs ?? Date.now;
  const positiveTtlMs = options.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS;
  const negativeTtlMs = options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;

  const cached = entries.get(key);
  if (cached && cached.expiresAtMs > nowMs()) return cached.definitions;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    let definitions: WrikeCustomFieldDefinition[] = [];
    try {
      definitions = await loader();
    } catch {
      definitions = [];
    }
    // A successful-but-empty catalogue gets the short TTL too: it is
    // indistinguishable from a partial outage, and an account with genuinely no
    // custom fields costs one cheap request per negative window.
    const ttlMs = definitions.length > 0 ? positiveTtlMs : negativeTtlMs;
    entries.set(key, { definitions, expiresAtMs: nowMs() + ttlMs });
    return definitions;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    // Cleared unconditionally -- leaving a settled promise in the map would pin
    // it for the lifetime of the process.
    inFlight.delete(key);
  }
}

/** Test seam. Not used by application code. */
export function clearCustomFieldDefinitionCache(): void {
  entries.clear();
  inFlight.clear();
}
