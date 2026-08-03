/**
 * Pre-auth pages that must never show the authenticated app shell/nav (and
 * that proxy.ts never redirects away from when unauthenticated). Kept
 * dependency-free so it can be safely imported from the proxy/middleware
 * runtime and from client components, neither of which should bundle
 * lib/auth.ts's server-only Supabase clients.
 */
export const PUBLIC_AUTH_PATHS = ["/login", "/recover", "/auth/callback", "/update-password"] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
