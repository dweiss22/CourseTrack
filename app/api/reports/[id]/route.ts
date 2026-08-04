import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { getReportDefinition, saveReport, setReportArchived } from "@/db/report-repository";
import { reportInputSchema } from "@/lib/report-engine";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  try { const report = await getReportDefinition((await context.params).id); return report ? NextResponse.json({ report }) : NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = reportInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the report definition and concurrency token.", parsed.success ? undefined : parsed.error.issues);
  try {
    const id = (await context.params).id; const current = await getReportDefinition(id);
    if (!current) return NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 });
    if (current.immutable) return NextResponse.json({ code: "forbidden", message: "Prebuilt reports are immutable. Duplicate the report to customize it." }, { status: 403 });
    if (current.ownerId !== auth.context.userId && !["admin", "super_admin"].includes(auth.context.role)) return NextResponse.json({ code: "forbidden", message: "Only the owner or an administrator can edit this report." }, { status: 403 });
    return NextResponse.json({ report: await saveReport({ id, ...parsed.data, actor: auth.context }), message: "Report saved." });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})); if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const id = (await context.params).id; const current = await getReportDefinition(id);
    if (!current) return NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 });
    if (current.immutable) return NextResponse.json({ code: "forbidden", message: "Prebuilt reports cannot be archived." }, { status: 403 });
    if (current.ownerId !== auth.context.userId && !["admin", "super_admin"].includes(auth.context.role)) return NextResponse.json({ code: "forbidden", message: "Only the owner or an administrator can archive this report." }, { status: 403 });
    return NextResponse.json({ report: await setReportArchived({ id, archived: true, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context }), message: "Report archived." });
  } catch (error) { return apiError(error); }
}
