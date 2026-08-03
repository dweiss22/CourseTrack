import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client for the login/recover/update-password client
 * components. Uses the anon/publishable key only -- Row Level Security is
 * what actually constrains what it can read or write.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return createBrowserClient(url, anonKey);
}
