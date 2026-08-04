import type { Metadata } from "next";
import { AdminWorkspace } from "@/components/portfolio-workspaces";
import { getImportPreviewSummary, getRecentRetrievalRuns } from "@/db";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Administration" };

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  await requireAdmin();
  const [retrievalRuns, importPreview] = await Promise.all([
    getRecentRetrievalRuns(),
    getImportPreviewSummary(),
  ]);
  return (
    <AdminWorkspace
      retrievalRuns={retrievalRuns}
      importPreview={importPreview}
    />
  );
}
