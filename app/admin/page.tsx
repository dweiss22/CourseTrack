import type { Metadata } from "next";
import { AdminWorkspace } from "@/components/portfolio-workspaces";
import { getImportPreviewSummary, getRecentRetrievalRuns, getSampleDataCounts, getWrikeConnection, getWrikeSync } from "@/db";

export const metadata: Metadata = { title: "Administration" };

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  const [sampleDataCounts, retrievalRuns, importPreview, wrikeConnection, wrikeSync] = await Promise.all([
    getSampleDataCounts(),
    getRecentRetrievalRuns(),
    getImportPreviewSummary(),
    getWrikeConnection(),
    getWrikeSync(),
  ]);
  return (
    <AdminWorkspace
      sampleDataCounts={sampleDataCounts}
      retrievalRuns={retrievalRuns}
      importPreview={importPreview}
      wrikeConnection={wrikeConnection}
      wrikeSync={wrikeSync}
    />
  );
}
