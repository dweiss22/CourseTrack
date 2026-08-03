/**
 * The exclusive application role list/type, split out from lib/auth.ts so
 * client components can import it without pulling in lib/auth.ts's
 * server-only Supabase clients (lib/supabase-ssr.ts imports next/headers,
 * which Next.js rejects from a client bundle) -- same reasoning as
 * lib/public-auth-paths.ts.
 */
export const APPLICATION_ROLES = ["super_admin", "admin", "accreditation", "content"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];
