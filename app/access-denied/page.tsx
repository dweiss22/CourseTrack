import type { Metadata } from "next";
import Link from "next/link";
import { getAuthContext, landingPathForRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Access denied" };

export default async function AccessDeniedPage() {
  const context = await getAuthContext();
  const landingPath = context ? landingPathForRole(context.role) : "/login";
  return (
    <div className="auth-card panel">
      <div className="panel-heading">
        <div>
          <h2>You don&apos;t have access to this area</h2>
          <p>Your role doesn&apos;t include this page. Contact an administrator if you believe this is a mistake.</p>
        </div>
      </div>
      <Link href={landingPath} className="button button-primary">
        Go to my dashboard
      </Link>
    </div>
  );
}
