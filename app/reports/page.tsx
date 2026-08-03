import type { Metadata } from "next";
import { ReportsWorkspace } from "@/components/portfolio-workspaces";
import { getReportMetrics } from "@/db";

export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const metrics = await getReportMetrics("2026-10-31");
  return <ReportsWorkspace metrics={metrics} />;
}
