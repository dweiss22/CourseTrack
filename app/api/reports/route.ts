import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { listReports, saveReport } from "@/db/report-repository";
import { reportInputSchema } from "@/lib/report-engine";

export async function GET(request: Request) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
  try {
    let reports = await listReports(includeArchived);
    if (includeArchived && !["admin", "super_admin"].includes(auth.context.role)) reports = reports.filter((report) => !report.archivedAt || report.ownerId === auth.context.userId);
    return NextResponse.json({ reports });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = reportInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the report definition.", parsed.error.issues);
  try { return NextResponse.json({ report: await saveReport({ ...parsed.data, actor: auth.context }), message: "Report created." }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
