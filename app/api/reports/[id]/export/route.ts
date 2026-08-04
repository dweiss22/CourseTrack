import { requireApiUser } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { getReportDefinition } from "@/db/report-repository";
import { getPortfolioCourses } from "@/db";
import { executeReport, reportCsv } from "@/lib/report-engine";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  if (new URL(request.url).searchParams.get("format") !== "csv") return new Response(JSON.stringify({ code: "validation_error", message: "Only CSV export is supported." }), { status: 422, headers: { "content-type": "application/json" } });
  try {
    const definition = await getReportDefinition((await context.params).id); if (!definition) return new Response(JSON.stringify({ code: "not_found", message: "Report not found." }), { status: 404, headers: { "content-type": "application/json" } });
    const courses = await getPortfolioCourses(); const count = executeReport(definition, courses, 1, 1).total; const result = executeReport(definition, courses, 1, Math.max(count, 1));
    const slug = definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"; const date = new Date().toISOString().slice(0, 10);
    return new Response(reportCsv(result), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug}-${date}.csv"`, "cache-control": "no-store", "x-coursetrack-message": "CSV downloaded successfully." } });
  } catch (error) { return apiError(error); }
}
