import type { Metadata } from "next";
import { AdminWorkspace } from "@/components/portfolio-workspaces";
import { getImportPreviewSummary, getRecentRetrievalRuns, getSampleDataCounts } from "@/db";

export const metadata: Metadata = { title: "Administration" };

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  const [sampleDataCounts, retrievalRuns, importPreview] = await Promise.all([
    getSampleDataCounts(),
    getRecentRetrievalRuns(),
    getImportPreviewSummary(),
  ]);
  return (
    <AdminWorkspace
      sampleDataCounts={sampleDataCounts}
      retrievalRuns={retrievalRuns}
      importPreview={importPreview}
    />
  );
}
