import { createBrowserClient } from "@supabase/ssr";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

let cachedClient: BrowserSupabaseClient | null = null;
let clientRequest: Promise<BrowserSupabaseClient> | null = null;

async function loadRuntimeConfiguration(): Promise<{ url: string; anonKey: string }> {
  const response = await fetch("/api/auth/config", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    url?: string;
    anonKey?: string;
    message?: string;
  };
  if (!response.ok || !payload.url || !payload.anonKey) {
    throw new Error(payload.message ?? "CourseTrack authentication is not configured.");
  }
  return { url: payload.url, anonKey: payload.anonKey };
}

/**
 * Browser-only Supabase client for the login/recover/update-password client
 * components. Uses the anon/publishable key only -- Row Level Security is
 * what actually constrains what it can read or write.
 */
export async function createSupabaseBrowserClient(): Promise<BrowserSupabaseClient> {
  if (cachedClient) return cachedClient;
  if (!clientRequest) {
    clientRequest = loadRuntimeConfiguration().then(({ url, anonKey }) =>
      createBrowserClient(url, anonKey),
    );
  }
  try {
    cachedClient = await clientRequest;
    return cachedClient;
  } finally {
    clientRequest = null;
  }
}
