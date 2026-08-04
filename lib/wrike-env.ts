const DEFAULT_API_HOST = "https://www.wrike.com";
const HOST_PATTERN = /^([a-z0-9-]+\.)*wrike\.com$/i;

export function isValidWrikeHost(hostname: string): boolean {
  return HOST_PATTERN.test(hostname);
}

/**
 * Validates a Wrike API host URL before it is ever used to build a request.
 * Throws rather than silently falling back — a bad host must never be used
 * to construct a server-side fetch.
 */
export function assertValidWrikeApiHost(apiHost: string): string {
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    throw new Error("Wrike API host must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Wrike API host must use HTTPS.");
  }
  if (!isValidWrikeHost(parsed.hostname)) {
    throw new Error("Wrike API host must be wrike.com or a wrike.com subdomain.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getTokenEncryptionKey(): string {
  const key = (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Configure it before connecting to Wrike.",
    );
  }
  return key;
}

/**
 * Reads the fallback permanent-token configuration used to initialize the
 * connection the first time (via POST /api/wrike/connect). Returns null
 * fields when unset — the connect route also accepts a token pasted through
 * the admin UI, so this is optional.
 */
export function readWrikeEnvFallback(): { token: string | null; apiHost: string } {
  const token = (process.env.WRIKE_PERMANENT_TOKEN ?? "").trim();
  const apiHost = (process.env.WRIKE_API_HOST ?? DEFAULT_API_HOST).trim();
  return { token: token || null, apiHost: assertValidWrikeApiHost(apiHost) };
}

export function getWrikeSyncCronSecret(): string | null {
  const secret = (process.env.WRIKE_SYNC_CRON_SECRET ?? "").trim();
  return secret || null;
}
