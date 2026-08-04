import { NextResponse } from "next/server";
import { landingPathForRole } from "@/lib/auth";
import { APPLICATION_ROLES, type ApplicationRole } from "@/lib/roles";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { createSupabaseServerClient } from "@/lib/supabase-ssr";

export async function GET() {
  const authClient = await createSupabaseServerClient();
  if (!authClient) {
    return NextResponse.json(
      { code: "auth_not_configured", message: "CourseTrack authentication is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { code: "not_authenticated", message: "The email or password was not accepted." },
      { status: 401 },
    );
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { code: "server_not_configured", message: "CourseTrack user administration is not configured." },
      { status: 503 },
    );
  }

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("id,email,role,account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const schemaNotReady = error.code === "42703" || /role|account_status/i.test(error.message);
    return NextResponse.json(
      {
        code: schemaNotReady ? "auth_schema_not_ready" : "profile_lookup_failed",
        message: schemaNotReady
          ? "CourseTrack user administration has not finished setup. Contact the site owner."
          : "CourseTrack could not verify your application access. Try again shortly.",
      },
      { status: 503 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        code: "membership_missing",
        message: "Your sign-in succeeded, but CourseTrack access has not been assigned. Contact the superadmin.",
      },
      { status: 403 },
    );
  }
  if (profile.account_status !== "active") {
    return NextResponse.json(
      { code: "account_disabled", message: "Your CourseTrack account is disabled. Contact the superadmin." },
      { status: 403 },
    );
  }
  if (!APPLICATION_ROLES.includes(profile.role as ApplicationRole)) {
    return NextResponse.json(
      { code: "invalid_role", message: "Your CourseTrack role is invalid. Contact the superadmin." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    code: "ready",
    landingPath: landingPathForRole(profile.role as ApplicationRole),
  });
}
