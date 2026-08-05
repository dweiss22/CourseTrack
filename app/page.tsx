import { redirect } from "next/navigation";
import {
  Dashboard,
} from "@/components/dashboard/dashboard";
import {
  getDashboardSnapshot,
  getRecentRetrievalRuns,
} from "@/db";
import { landingPathForRole, requireUser } from "@/lib/auth";
import { verticals, type Vertical } from "@/types/course";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ vertical?: string; excluded?: string }> }) {
  const context = await requireUser();
  const landingPath = landingPathForRole(context.role);
  if (landingPath !== "/") redirect(landingPath);

  const query = await searchParams;
  const selectedVertical = verticals.includes(query.vertical as Vertical) ? query.vertical as Vertical : "All verticals";
  const includeExcluded = query.excluded === "1";

  const [snapshot, retrievalRuns] = await Promise.all([
    getDashboardSnapshot({ vertical: selectedVertical, includeExcluded }),
    getRecentRetrievalRuns(),
  ]);
  const firstName = context.firstName || context.displayName.split(/\s+/)[0] || context.email.split("@")[0];
  return <Dashboard snapshot={snapshot} retrievalRuns={retrievalRuns} firstName={firstName} selectedVertical={selectedVertical} includeExcluded={includeExcluded} />;
}
