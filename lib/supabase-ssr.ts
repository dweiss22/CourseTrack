import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseAuthConfig = {
  url: string;
  anonKey: string;
};

function readAuthConfig(): SupabaseAuthConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url && !anonKey) return null;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase Auth is only partially configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY together.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), anonKey };
}

export function isSupabaseAuthConfigured(): boolean {
  return readAuthConfig() !== null;
}

/**
 * A cookie-backed Supabase client for Server Components, Route Handlers, and
 * Server Actions. Returns null when Supabase Auth isn't configured (sample
 * mode) rather than throwing -- callers fall back to a synthetic identity.
 */
export async function createSupabaseServerClient() {
  const config = readAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies -- safe to
          // ignore since middleware refreshes the session on every request.
        }
      },
    },
  });
}
