import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-ssr";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { APPLICATION_ROLES, type ApplicationRole } from "@/lib/roles";

export { APPLICATION_ROLES };
export type { ApplicationRole };

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  role: ApplicationRole;
}

/** Where a role lands immediately after signing in. */
export function landingPathForRole(role: ApplicationRole): string {
  switch (role) {
    case "accreditation":
      return "/accreditation";
    case "content":
      return "/versions";
    default:
      return "/";
  }
}

const SAMPLE_AUTH_CONTEXT: AuthContext = {
  userId: "sample-super-admin",
  email: "sample-admin@coursetrack.local",
  displayName: "Sample Super Admin",
  role: "super_admin",
};

/**
 * Resolves the real signed-in user and their authoritative application
 * role. Returns null when there's no session, no application membership
 * (an administrator hasn't created one), or the account is disabled --
 * never trusts a role from anywhere but the profiles row. Falls back to a
 * synthetic sample identity only when Supabase Auth isn't configured at all
 * (sample-data mode), mirroring this app's existing sample-data-fallback
 * philosophy rather than a NODE_ENV-gated bypass.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const authClient = await createSupabaseServerClient();
  if (!authClient) return SAMPLE_AUTH_CONTEXT;

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) return null;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return null;

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,email,display_name,role,account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.account_status !== "active") return null;

  return {
    userId: profile.id as string,
    email: profile.email as string,
    displayName: profile.display_name as string,
    role: profile.role as ApplicationRole,
  };
}

// ---------------------------------------------------------------------------
// Page / Server Component guards -- redirect on failure.
// ---------------------------------------------------------------------------

export async function requireUser(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}

export async function requirePageRole(...allowedRoles: ApplicationRole[]): Promise<AuthContext> {
  const context = await requireUser();
  if (!allowedRoles.includes(context.role)) {
    redirect("/access-denied");
  }
  return context;
}

export async function requireAdmin(): Promise<AuthContext> {
  return requirePageRole("super_admin", "admin");
}

export async function requireSuperAdmin(): Promise<AuthContext> {
  return requirePageRole("super_admin");
}

// ---------------------------------------------------------------------------
// API route / route handler guards -- return a result, never throw.
// ---------------------------------------------------------------------------

export type ApiAuthResult = { context: AuthContext } | { error: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult> {
  const context = await getAuthContext();
  if (!context) {
    return { error: NextResponse.json({ message: "Authentication is required." }, { status: 401 }) };
  }
  return { context };
}

export async function requireApiRole(...allowedRoles: ApplicationRole[]): Promise<ApiAuthResult> {
  const result = await requireApiUser();
  if ("error" in result) return result;
  if (!allowedRoles.includes(result.context.role)) {
    return {
      error: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 }),
    };
  }
  return result;
}

export async function requireApiAdmin(): Promise<ApiAuthResult> {
  return requireApiRole("super_admin", "admin");
}

export async function requireApiSuperAdmin(): Promise<ApiAuthResult> {
  return requireApiRole("super_admin");
}
