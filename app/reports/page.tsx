import type { Metadata } from "next";
import { ReportsWorkspace } from "@/components/portfolio-workspaces";
import { getReportMetrics } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireUser();
  const metrics = await getReportMetrics();
  return <ReportsWorkspace metrics={metrics} />;
}
