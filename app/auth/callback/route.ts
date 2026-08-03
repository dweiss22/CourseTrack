import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-ssr";

/**
 * Resolves `next` against the request's own origin and only honors it if it
 * still points there -- resolving (not just prefix-checking) is what catches
 * a value like "/\\evil.example", which starts with "/" but which `new
 * URL(next, request.url)` would otherwise normalize into a protocol-relative
 * redirect to a different host.
 */
function safeNextPath(value: string | null, origin: string): string {
  const fallback = "/update-password";
  if (!value) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== origin) return fallback;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * Exchanges a Supabase recovery/magic-link code for a session, then
 * redirects. Used by both the first-time password setup flow and the
 * forgotten-password flow -- both funnel through /update-password.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), url.origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
