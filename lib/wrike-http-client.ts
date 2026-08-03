import { assertValidWrikeApiHost } from "@/lib/wrike-env";

export class WrikeApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "WrikeApiError";
    this.status = status;
  }
}

const MAX_RETRY_ATTEMPTS = 3;
const MAX_PAGES = 20;

export function sanitizeErrorMessage(message: string): string {
  // Defensive redaction in case an error message ever echoes back a header
  // value or token-shaped string; truncated to keep logs/UI messages small.
  return message
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .slice(0, 300);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(500 * 2 ** attempt, 8_000);
}

export interface WrikeRequestInput {
  apiHost: string;
  accessToken: string;
  path: string;
  searchParams?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

/**
 * Calls the Wrike API with bounded retry on 429/5xx (honoring Retry-After),
 * never logs the token or full response bodies, and never trusts a
 * caller-supplied host without validation.
 */
export async function callWrikeApi<T>(input: WrikeRequestInput): Promise<T> {
  const validatedHost = assertValidWrikeApiHost(input.apiHost);
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepImpl = input.sleepImpl ?? defaultSleep;
  const maxRetries = input.maxRetries ?? MAX_RETRY_ATTEMPTS;

  const url = new URL(`${validatedHost}${input.path}`);
  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let lastError: WrikeApiError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (error) {
      lastError = new WrikeApiError(
        sanitizeErrorMessage(error instanceof Error ? error.message : "Network error calling Wrike."),
        null,
      );
      if (attempt === maxRetries) throw lastError;
      await sleepImpl(backoffDelayMs(attempt, null));
      continue;
    }

    if (response.status === 401) {
      throw new WrikeApiError("Wrike rejected the stored access token.", 401);
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new WrikeApiError(
        `Wrike returned ${response.status} for ${input.path}.`,
        response.status,
      );
      if (attempt === maxRetries) throw lastError;
      await sleepImpl(backoffDelayMs(attempt, response.headers.get("retry-after")));
      continue;
    }

    if (!response.ok) {
      throw new WrikeApiError(
        sanitizeErrorMessage(`Wrike returned ${response.status} for ${input.path}.`),
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  throw lastError ?? new WrikeApiError("Wrike request failed after retries.", null);
}

export interface WrikePage<T> {
  kind: string;
  data: T[];
  nextPageToken?: string;
}

/**
 * Follows Wrike's cursor pagination (nextPageToken) defensively, capped at
 * MAX_PAGES per folder as a runaway guard.
 */
export async function fetchAllWrikePages<T>(
  input: Omit<WrikeRequestInput, "path"> & { path: string },
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchParams = { ...(input.searchParams ?? {}) };
    if (pageToken) searchParams.pageToken = pageToken;
    const result = await callWrikeApi<WrikePage<T>>({ ...input, searchParams });
    items.push(...result.data);
    if (!result.nextPageToken) return items;
    pageToken = result.nextPageToken;
  }
  console.warn(`Wrike pagination cap (${MAX_PAGES} pages) reached for ${input.path}; stopping early.`);
  return items;
}
