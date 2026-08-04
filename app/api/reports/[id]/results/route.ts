import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { getReportDefinition } from "@/db/report-repository";
import { getPortfolioCourses } from "@/db";
import { executeReport } from "@/lib/report-engine";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams; const rawPage = Number(params.get("page") ?? 1); const rawPageSize = Number(params.get("pageSize") ?? 50);
  if (!Number.isInteger(rawPage) || rawPage < 1 || !Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 200) return validationError("Pagination values are invalid.");
  const page = rawPage; const pageSize = rawPageSize;
  try { const definition = await getReportDefinition((await context.params).id); if (!definition) return NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 }); return NextResponse.json({ result: executeReport(definition, await getPortfolioCourses(), page, pageSize) }); }
  catch (error) { return apiError(error); }
}
