import type { Metadata } from "next";
import { ReportCatalog } from "@/components/reports/reports-client";
import { listReports } from "@/db/report-repository";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const actor = await requireUser();
  let reports = await listReports(true);
  if (!["admin", "super_admin"].includes(actor.role)) reports = reports.filter((report) => !report.archivedAt || report.ownerId === actor.userId);
  return <ReportCatalog initialReports={reports} actorId={actor.userId} isAdmin={["admin", "super_admin"].includes(actor.role)} />;
}
