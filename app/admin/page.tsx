import type { Metadata } from "next";
import { AdminWorkspace } from "@/components/portfolio-workspaces";
import { getIntegrationMappingSummary, getRecentRetrievalRuns, getWrikeConnection, getWrikeSync } from "@/db";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Administration" };

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  const context = await requireAdmin();
  const [retrievalRuns, mappingSummary, wrikeConnection, wrikeSync] = await Promise.all([
    getRecentRetrievalRuns(),
    getIntegrationMappingSummary(),
    getWrikeConnection(),
    getWrikeSync(),
  ]);
  return (
    <AdminWorkspace
      retrievalRuns={retrievalRuns}
      mappingSummary={mappingSummary}
      wrikeConnection={wrikeConnection}
      wrikeSync={wrikeSync}
      userId={context.userId}
    />
  );
}
