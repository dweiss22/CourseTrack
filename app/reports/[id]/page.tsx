import { notFound } from "next/navigation";
import { ReportViewer } from "@/components/reports/reports-client";
import { getReportDefinition } from "@/db/report-repository";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const report = await getReportDefinition((await params).id, true);
  if (!report) notFound();
  if (report.archivedAt && report.ownerId !== actor.userId && !["admin", "super_admin"].includes(actor.role)) notFound();
  const canEdit = !report.immutable && (report.ownerId === actor.userId || ["admin", "super_admin"].includes(actor.role));
  return <ReportViewer initialReport={report} canEdit={canEdit} isAdmin={["admin", "super_admin"].includes(actor.role)} />;
}
