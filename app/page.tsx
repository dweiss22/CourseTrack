import { redirect } from "next/navigation";
import {
  Dashboard,
} from "@/components/dashboard/dashboard";
import {
  getDashboardSnapshot,
  getRecentRetrievalRuns,
} from "@/db";
import { landingPathForRole, requireUser } from "@/lib/auth";
import { withServerOperation } from "@/lib/server-observability";

export const dynamic = "force-dynamic";

export default async function Home() {
  const context = await requireUser();
  const landingPath = landingPathForRole(context.role);
  if (landingPath !== "/") redirect(landingPath);

  const [snapshot, retrievalRuns] = await withServerOperation(
    { route: "/", operation: "load dashboard data" },
    () => Promise.all([
      getDashboardSnapshot(),
      getRecentRetrievalRuns(),
    ]),
  );
  const firstName = context.firstName || context.displayName.split(/\s+/)[0] || context.email.split("@")[0];
  return <Dashboard snapshot={snapshot} retrievalRuns={retrievalRuns} firstName={firstName} userId={context.userId} />;
}
