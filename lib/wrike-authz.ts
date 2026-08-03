import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { demoUser, hasPermission, type Permission } from "@/lib/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Wrike routes write through the Supabase service-role client (bypassing
 * RLS, same as every other write path in this codebase), so the actual
 * signed-in user's role must be checked explicitly rather than relying on
 * `demoUser.role` — checking a hardcoded constant would let any
 * authenticated user perform admin/version-manager-only actions in
 * production. Denies (fails closed) if the permission check itself fails.
 */
export async function requireWrikePermission(
  permission: Permission,
): Promise<{ email: string } | { error: NextResponse }> {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return { error: NextResponse.json({ message: "Authentication is required." }, { status: 401 }) };
  }

  if (!user) {
    // No authenticated caller (dev/sample mode only — production requires
    // one above). There is no per-user role to check against, so fall back
    // to the same demo-role gate the rest of the app uses in this mode.
    if (!hasPermission(demoUser.role, permission)) {
      return {
        error: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 }),
      };
    }
    return { email: demoUser.email };
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    // Sample-data mode has no real per-user role system to check against.
    if (!hasPermission(demoUser.role, permission)) {
      return {
        error: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 }),
      };
    }
    return { email: user.email };
  }

  const { data, error } = await client.rpc("has_permission_for_email", {
    p_email: user.email,
    p_permission: permission,
  });
  if (error || data !== true) {
    return {
      error: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 }),
    };
  }
  return { email: user.email };
}
